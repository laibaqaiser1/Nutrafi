'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCategory } from '@/lib/utils'

interface Dish {
  id: string
  name: string
  description: string | null
  category: string
  ingredients: string | null
  allergens: string | null
  calories: number
  protein: number
  carbs: number
  fats: number
  price: number | null
  status: string
}


export default function MenuPage() {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: '',
    minCalories: '',
    maxCalories: '',
    minProtein: '',
    maxProtein: '',
  })
  const [ingredientsModal, setIngredientsModal] = useState<{
    isOpen: boolean
    dish: Dish | null
    ingredients: string
  }>({
    isOpen: false,
    dish: null,
    ingredients: '',
  })
  const [updating, setUpdating] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    setCurrentPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    fetchDishes(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters])

  const fetchDishes = async (page: number = currentPage) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.append('search', filters.search)
      if (filters.category) params.append('category', filters.category)
      if (filters.status) params.append('status', filters.status)
      if (filters.minCalories) params.append('minCalories', filters.minCalories)
      if (filters.maxCalories) params.append('maxCalories', filters.maxCalories)
      if (filters.minProtein) params.append('minProtein', filters.minProtein)
      if (filters.maxProtein) params.append('maxProtein', filters.maxProtein)
      params.append('page', page.toString())
      params.append('limit', '10')

      const response = await fetch(`/api/menu?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setDishes(data.dishes || data) // Handle both old and new response format
        setTotal(data.total || data.length || 0)
        setTotalPages(data.totalPages || Math.ceil((data.total || data.length || 0) / 10))
      }
    } catch (error) {
      console.error('Error fetching dishes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dish?')) return

    try {
      const response = await fetch(`/api/menu/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchDishes()
      }
    } catch (error) {
      console.error('Error deleting dish:', error)
    }
  }

  const handleExport = async () => {
    try {
      const response = await fetch('/api/menu/export')
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `nutrafi-menu-${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error exporting menu:', error)
    }
  }

  const handleOpenIngredients = (dish: Dish) => {
    setIngredientsModal({
      isOpen: true,
      dish,
      ingredients: dish.ingredients || '',
    })
  }

  const handleCloseIngredients = () => {
    setIngredientsModal({
      isOpen: false,
      dish: null,
      ingredients: '',
    })
  }

  const handleUpdateIngredients = async () => {
    if (!ingredientsModal.dish) return

    setUpdating(true)
    try {
      const response = await fetch(`/api/menu/${ingredientsModal.dish.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ingredients: ingredientsModal.ingredients,
        }),
      })

      if (response.ok) {
        await fetchDishes()
        handleCloseIngredients()
      } else {
        const error = await response.json()
        alert(`Failed to update ingredients: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating ingredients:', error)
      alert('Failed to update ingredients')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800"
          >
            Export to Excel
          </button>
          <Link
            href="/menu/new"
            className="px-4 py-2 bg-nutrafi-primary text-white rounded-md hover:bg-nutrafi-dark"
          >
            Add New Dish
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <input
            type="text"
            placeholder="Search by name..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Categories</option>
            <option value="BREAKFAST">Breakfast</option>
            <option value="LUNCH">Lunch</option>
            <option value="DINNER">Dinner</option>
            <option value="LUNCH_DINNER">Lunch/Dinner</option>
            <option value="SNACK">Snack</option>
            <option value="SMOOTHIE">Smoothie</option>
            <option value="JUICE">Juice</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <input
            type="number"
            placeholder="Min Calories"
            value={filters.minCalories}
            onChange={(e) => setFilters({ ...filters, minCalories: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <input
            type="number"
            placeholder="Max Calories"
            value={filters.maxCalories}
            onChange={(e) => setFilters({ ...filters, maxCalories: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          <input
            type="number"
            placeholder="Min Protein"
            value={filters.minProtein}
            onChange={(e) => setFilters({ ...filters, minProtein: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      {/* Dishes Table */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calories</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Protein</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carbs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fats</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ingredients</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dishes.map((dish) => (
                <tr key={dish.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{dish.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCategory(dish.category)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dish.calories} kcal</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dish.protein}g</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dish.carbs}g</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dish.fats}g</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{dish.price ? `AED ${dish.price}` : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleOpenIngredients(dish)}
                      className="text-nutrafi-primary hover:text-nutrafi-dark underline"
                    >
                      Ingredients
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      dish.status === 'ACTIVE' ? 'bg-[#f0f4e8] text-nutrafi-dark' : 'bg-red-100 text-red-800'
                    }`}>
                      {dish.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === dish.id ? null : dish.id)}
                        className="text-gray-600 hover:text-gray-900 focus:outline-none"
                        aria-label="Actions"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {openDropdown === dish.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenDropdown(null)}
                          ></div>
                          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                            <div className="py-1">
                              <Link
                                href={`/menu/${dish.id}/edit`}
                                onClick={() => setOpenDropdown(null)}
                                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Edit
                              </Link>
                              <button
                                onClick={() => {
                                  setOpenDropdown(null)
                                  handleDelete(dish.id)
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {dishes.length === 0 && (
            <div className="text-center py-8 text-gray-500">No dishes found</div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * 10 + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * 10, total)}</span> of{' '}
                    <span className="font-medium">{total}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-nutrafi-primary border-nutrafi-primary text-white'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

       {/* Ingredients Modal */}
       {ingredientsModal.isOpen && ingredientsModal.dish && (
         <div className="fixed inset-0 bg-black bg-opacity-10 backdrop-blur-md overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full m-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                Ingredients - {ingredientsModal.dish.name}
              </h3>
              <button
                onClick={handleCloseIngredients}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ingredients
              </label>
              <textarea
                value={ingredientsModal.ingredients}
                onChange={(e) =>
                  setIngredientsModal({
                    ...ingredientsModal,
                    ingredients: e.target.value,
                  })
                }
                placeholder="Enter ingredients (comma-separated or one per line)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-nutrafi-primary focus:border-nutrafi-primary"
                rows={8}
              />
              <p className="mt-2 text-sm text-gray-500">
                You can enter ingredients as a comma-separated list or one per line.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={handleCloseIngredients}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={updating}
              >
                Cancel
              </button>
               <button
                 onClick={handleUpdateIngredients}
                 disabled={updating}
                 className="px-4 py-2 text-sm font-medium text-white bg-nutrafi-primary rounded-md hover:bg-nutrafi-dark disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {updating ? 'Updating...' : 'Update Ingredients'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

