"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Search, CheckCircle2 } from "lucide-react"
import AdminLayout from "../../components/layout/AdminLayout"
import { useDispatch, useSelector } from "react-redux"
import { checklistHistoryData } from "../../redux/slice/checklistSlice"
import { postChecklistAdminDoneAPI } from "../../redux/api/checkListApi"
import { uniqueDoerNameData } from "../../redux/slice/assignTaskSlice"

function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMembers, setSelectedMembers] = useState([])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [userRole, setUserRole] = useState("")
  const [username, setUsername] = useState("")
  const [currentPageHistory, setCurrentPageHistory] = useState(1)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [initialHistoryLoading, setInitialHistoryLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Admin approval states
  const [selectedHistoryItems, setSelectedHistoryItems] = useState([])
  const [markingAsDone, setMarkingAsDone] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    itemCount: 0,
  })

  const { history } = useSelector((state) => state.checkList)
  const { doerName } = useSelector((state) => state.assignTask)
  const dispatch = useDispatch()

  const historyTableContainerRef = useRef(null)

  useEffect(() => {
    dispatch(checklistHistoryData(1))
    dispatch(uniqueDoerNameData())
  }, [dispatch])

  useEffect(() => {
    const role = localStorage.getItem("role")
    const user = localStorage.getItem("user-name")
    setUserRole(role || "")
    setUsername(user || "")
    setIsSuperAdmin(user === "admin")
  }, [])

  // Handle scroll for history
  const handleScrollHistory = useCallback(() => {
    if (!historyTableContainerRef.current || isLoadingMoreHistory || !hasMoreHistory || history.length === 0) return

    const { scrollTop, scrollHeight, clientHeight } = historyTableContainerRef.current
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100

    if (isNearBottom) {
      setIsLoadingMoreHistory(true)
      dispatch(checklistHistoryData(currentPageHistory + 1))
        .then((result) => {
          if (result.payload && result.payload.length < 50) {
            setHasMoreHistory(false)
          }
          setCurrentPageHistory(prev => prev + 1)
        })
        .finally(() => setIsLoadingMoreHistory(false))
    }
  }, [isLoadingMoreHistory, hasMoreHistory, currentPageHistory, dispatch, history.length])

  useEffect(() => {
    const historyTableElement = historyTableContainerRef.current
    if (historyTableElement) {
      historyTableElement.addEventListener('scroll', handleScrollHistory)
      return () => historyTableElement.removeEventListener('scroll', handleScrollHistory)
    }
  }, [handleScrollHistory])

  // Load initial history data
  useEffect(() => {
    if (history.length === 0) {
      setInitialHistoryLoading(true)
      dispatch(checklistHistoryData(1))
        .then((result) => {
          if (result.payload && result.payload.length < 50) {
            setHasMoreHistory(false)
          }
        })
        .finally(() => setInitialHistoryLoading(false))
    }
  }, [history.length, dispatch])

  const parseSupabaseDate = (dateStr) => {
    if (!dateStr) return null
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      return new Date(dateStr)
    }
    if (dateStr instanceof Date) {
      return dateStr
    }
    return new Date(dateStr)
  }

  const resetFilters = () => {
    setSearchTerm("")
    setSelectedMembers([])
    setStartDate("")
    setEndDate("")
  }

  // Handle checkbox selection for admin approval
  const handleHistoryItemSelect = (taskId, isChecked) => {
    if (isChecked) {
      setSelectedHistoryItems(prev => [...prev, { task_id: taskId }])
    } else {
      setSelectedHistoryItems(prev => prev.filter(item => item.task_id !== taskId))
    }
  }

  // Handle select all for items without admin_done = 'Done'
  const handleSelectAll = (isChecked) => {
    if (isChecked) {
      const pendingItems = filteredHistoryData
        .filter(item => item.admin_done !== 'Done')
        .map(item => ({ task_id: item.task_id }))
      setSelectedHistoryItems(pendingItems)
    } else {
      setSelectedHistoryItems([])
    }
  }

  // Mark selected items as done
  const handleMarkDone = async () => {
    if (selectedHistoryItems.length === 0) return
    setConfirmationModal({
      isOpen: true,
      itemCount: selectedHistoryItems.length,
    })
  }

  const confirmMarkDone = async () => {
    setConfirmationModal({ isOpen: false, itemCount: 0 })
    setMarkingAsDone(true)
    try {
      const { data, error } = await postChecklistAdminDoneAPI(selectedHistoryItems)

      if (error) {
        throw new Error(error.message || "Failed to mark items as done")
      }

      setSelectedHistoryItems([])
      dispatch(checklistHistoryData(1))
      setSuccessMessage(`Successfully marked ${selectedHistoryItems.length} items as approved!`)
      
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error("Error marking tasks as done:", error)
      setSuccessMessage(`Failed to mark tasks as done: ${error.message}`)
    } finally {
      setMarkingAsDone(false)
    }
  }

  // Filtered data
  const filteredHistoryData = useMemo(() => {
    if (!Array.isArray(history)) return []

    const filtered = history
      .filter((item) => {
        const matchesSearch = searchTerm
          ? Object.entries(item).some(([key, value]) => {
            if (['image', 'admin_done'].includes(key)) return false
            return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
          })
          : true

        const matchesMember = selectedMembers.length > 0
          ? selectedMembers.includes(item.name)
          : true

        let matchesDateRange = true
        if (startDate || endDate) {
          const itemDate = parseSupabaseDate(item.task_start_date)
          if (!itemDate || isNaN(itemDate.getTime())) return false

          const itemDateOnly = new Date(
            itemDate.getFullYear(),
            itemDate.getMonth(),
            itemDate.getDate()
          )

          const start = startDate ? new Date(startDate) : null
          if (start) start.setHours(0, 0, 0, 0)

          const end = endDate ? new Date(endDate) : null
          if (end) end.setHours(23, 59, 59, 999)

          if (start && itemDateOnly < start) matchesDateRange = false
          if (end && itemDateOnly > end) matchesDateRange = false
        }

        return matchesSearch && matchesMember && matchesDateRange
      })
      .sort((a, b) => {
        const dateA = parseSupabaseDate(a.submission_date)
        const dateB = parseSupabaseDate(b.submission_date)
        if (!dateA) return 1
        if (!dateB) return -1
        return dateB - dateA
      })

    return filtered.slice(0, currentPageHistory * 50)
  }, [history, searchTerm, selectedMembers, startDate, endDate, currentPageHistory])

  const handleMemberSelection = (member) => {
    setSelectedMembers((prev) => {
      if (prev.includes(member)) {
        return prev.filter((item) => item !== member)
      } else {
        return [...prev, member]
      }
    })
  }

  const getFilteredMembersList = () => {
    if (userRole === "admin") {
      return doerName
    } else {
      return doerName.filter((member) => member.toLowerCase() === username.toLowerCase())
    }
  }

  // Check if an item is selected
  const isItemSelected = (taskId) => {
    return selectedHistoryItems.some(item => item.task_id === taskId)
  }

  // Count pending approval items
  const pendingApprovalCount = filteredHistoryData.filter(item => item.admin_done !== 'Done').length

  // Confirmation Modal Component
  const ConfirmationModal = ({ isOpen, itemCount, onConfirm, onCancel }) => {
    if (!isOpen) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
        <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-green-100 text-green-600 rounded-full p-3 mr-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">Approve Items</h2>
          </div>

          <p className="text-gray-600 text-center mb-6 text-sm sm:text-base">
            Are you sure you want to approve {itemCount} {itemCount === 1 ? "item" : "items"}?
          </p>

          <div className="flex justify-center space-x-4">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm sm:text-base"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
        <div className="flex flex-col gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-purple-700">
            History - Approval Pending
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            View completed tasks and approve them (Admin only can approve)
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className={`p-4 rounded-lg ${successMessage.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            {successMessage}
          </div>
        )}

        {/* Filters - Compact Layout */}
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4">
          <div className="flex flex-wrap gap-2 sm:gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Date Range */}
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-xs text-gray-500 block">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
            </div>

            {/* Member Filter Dropdown */}
            {userRole === "admin" && doerName && doerName.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block">Member</label>
                <select
                  value={selectedMembers[0] || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedMembers([e.target.value]);
                    } else {
                      setSelectedMembers([]);
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm bg-white min-w-[120px]"
                >
                  <option value="">All Members</option>
                  {getFilteredMembersList().map((member) => (
                    <option key={member} value={member}>{member}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={resetFilters}
              className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              Reset
            </button>

            {/* Admin Approval Button */}
            {isSuperAdmin && selectedHistoryItems.length > 0 && (
              <button
                onClick={handleMarkDone}
                disabled={markingAsDone}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                {markingAsDone ? "..." : `Approve (${selectedHistoryItems.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4">
          <div className="flex flex-wrap gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{filteredHistoryData.length}</div>
              <div className="text-xs text-gray-500">Total Records</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{pendingApprovalCount}</div>
              <div className="text-xs text-gray-500">Pending Approval</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{filteredHistoryData.length - pendingApprovalCount}</div>
              <div className="text-xs text-gray-500">Approved</div>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div ref={historyTableContainerRef} className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            {initialHistoryLoading ? (
              <div className="text-center py-10">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-4"></div>
                <p className="text-purple-600 text-sm sm:text-base">Loading history data...</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="sm:hidden space-y-3 p-3">
                  {filteredHistoryData.length > 0 ? (
                    filteredHistoryData.map((historyItem, index) => (
                      <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            {isSuperAdmin && historyItem.admin_done !== 'Done' && (
                              <input
                                type="checkbox"
                                checked={isItemSelected(historyItem.task_id)}
                                onChange={(e) => handleHistoryItemSelect(historyItem.task_id, e.target.checked)}
                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            )}
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              historyItem.admin_done === 'Done'
                                ? "bg-green-100 text-green-800"
                                : "bg-orange-100 text-orange-800"
                            }`}>
                              {historyItem.admin_done === 'Done' ? "Approved" : "Pending"}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">#{historyItem.task_id}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-2">{historyItem.task_description || "—"}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-gray-500">Name:</span> <span className="font-medium">{historyItem.name || "—"}</span></div>
                          <div><span className="text-gray-500">Dept:</span> <span className="font-medium">{historyItem.department || "—"}</span></div>
                          <div><span className="text-gray-500">Given By:</span> <span className="font-medium">{historyItem.given_by || "—"}</span></div>
                          <div><span className="text-gray-500">Frequency:</span> <span className="font-medium">{historyItem.frequency || "—"}</span></div>
                          <div><span className="text-gray-500">Start:</span> <span className="font-medium">{historyItem.task_start_date ? (() => {
                            const date = parseSupabaseDate(historyItem.task_start_date)
                            if (!date || isNaN(date.getTime())) return "—"
                            return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`
                          })() : "—"}</span></div>
                          <div><span className="text-gray-500">Submitted:</span> <span className="font-medium">{historyItem.submission_date ? (() => {
                            const dateObj = new Date(historyItem.submission_date)
                            return `${("0" + dateObj.getDate()).slice(-2)}/${("0" + (dateObj.getMonth() + 1)).slice(-2)}/${dateObj.getFullYear()}`
                          })() : "—"}</span></div>
                        </div>
                        {historyItem.remark && (
                          <div className="mt-2 text-xs"><span className="text-gray-500">Remarks:</span> <span className="font-medium">{historyItem.remark}</span></div>
                        )}
                        {historyItem.image && (
                          <a href={historyItem.image} target="_blank" rel="noopener noreferrer" className="mt-2 text-blue-600 text-xs underline flex items-center gap-1">
                            <img src={historyItem.image} alt="Attachment" className="h-6 w-6 object-cover rounded" /> View File
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      {searchTerm || selectedMembers.length > 0 || startDate || endDate
                        ? "No records matching your filters"
                        : "No completed records found"}
                    </div>
                  )}
                </div>

                {/* Desktop Table View */}
                <table className="min-w-full divide-y divide-gray-200 hidden sm:table">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {/* Checkbox Column - Only for Super Admin */}
                    {isSuperAdmin && (
                      <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          checked={selectedHistoryItems.length > 0 && selectedHistoryItems.length === pendingApprovalCount}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                      </th>
                    )}
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin Status
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task ID
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Given By
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                      Task Description
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">
                      Task Start Date
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Frequency
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">
                      Submission Date
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">
                      Status
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-purple-50 min-w-[120px]">
                      Remarks
                    </th>
                    <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHistoryData.length > 0 ? (
                    filteredHistoryData.map((historyItem, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {/* Checkbox - Only show if admin_done is NOT 'Done' */}
                        {isSuperAdmin && (
                          <td className="px-2 sm:px-3 py-2 sm:py-4">
                            {historyItem.admin_done !== 'Done' ? (
                              <input
                                type="checkbox"
                                checked={isItemSelected(historyItem.task_id)}
                                onChange={(e) => handleHistoryItemSelect(historyItem.task_id, e.target.checked)}
                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {/* Admin Done Status */}
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            historyItem.admin_done === 'Done'
                              ? "bg-green-100 text-green-800"
                              : "bg-orange-100 text-orange-800"
                          }`}>
                            {historyItem.admin_done === 'Done' ? "Approved" : "Pending"}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <div className="text-xs sm:text-sm font-medium text-gray-900">
                            {historyItem.task_id || "—"}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <div className="text-xs sm:text-sm text-gray-900">{historyItem.department || "—"}</div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <div className="text-xs sm:text-sm text-gray-900">{historyItem.given_by || "—"}</div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <div className="text-xs sm:text-sm text-gray-900">{historyItem.name || "—"}</div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4 min-w-[150px]">
                          <div className="text-xs sm:text-sm text-gray-900" title={historyItem.task_description}>
                            {historyItem.task_description || "—"}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4 bg-yellow-50">
                          <div className="text-xs sm:text-sm text-gray-900">
                            {historyItem.task_start_date ? (() => {
                              const date = parseSupabaseDate(historyItem.task_start_date)
                              if (!date || isNaN(date.getTime())) return "Invalid date"
                              const day = date.getDate().toString().padStart(2, '0')
                              const month = (date.getMonth() + 1).toString().padStart(2, '0')
                              const year = date.getFullYear()
                              return `${day}/${month}/${year}`
                            })() : "—"}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          <div className="text-xs sm:text-sm text-gray-900">{historyItem.frequency || "—"}</div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4 bg-green-50">
                          <div className="text-xs sm:text-sm text-gray-900">
                            {historyItem.submission_date ? (() => {
                              const dateObj = new Date(historyItem.submission_date)
                              const day = ("0" + dateObj.getDate()).slice(-2)
                              const month = ("0" + (dateObj.getMonth() + 1)).slice(-2)
                              const year = dateObj.getFullYear()
                              const hours = ("0" + dateObj.getHours()).slice(-2)
                              const minutes = ("0" + dateObj.getMinutes()).slice(-2)
                              return (
                                <div>
                                  <div className="font-medium">{`${day}/${month}/${year}`}</div>
                                  <div className="text-xs text-gray-500">{`${hours}:${minutes}`}</div>
                                </div>
                              )
                            })() : "—"}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4 bg-blue-50">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            historyItem.status === "yes"
                              ? "bg-green-100 text-green-800"
                              : historyItem.status === "no"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                          }`}>
                            {historyItem.status || "—"}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4 bg-purple-50 min-w-[120px]">
                          <div className="text-xs sm:text-sm text-gray-900" title={historyItem.remark}>
                            {historyItem.remark || "—"}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-4">
                          {historyItem.image ? (
                            <a
                              href={historyItem.image}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline flex items-center text-xs sm:text-sm"
                            >
                              <img
                                src={historyItem.image}
                                alt="Attachment"
                                className="h-6 w-6 sm:h-8 sm:w-8 object-cover rounded-md mr-2"
                              />
                              View
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs sm:text-sm">No file</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isSuperAdmin ? 14 : 13} className="px-4 sm:px-6 py-4 text-center text-gray-500 text-xs sm:text-sm">
                        {searchTerm || selectedMembers.length > 0 || startDate || endDate
                          ? "No records matching your filters"
                          : "No completed records found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </>
            )}

            {isLoadingMoreHistory && (
              <div className="sticky bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-200 py-3">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500 mr-2"></div>
                  <span className="text-purple-600 text-sm">Loading more...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={confirmationModal.isOpen}
          itemCount={confirmationModal.itemCount}
          onConfirm={confirmMarkDone}
          onCancel={() => setConfirmationModal({ isOpen: false, itemCount: 0 })}
        />
      </div>
    </AdminLayout>
  )
}

export default HistoryPage
