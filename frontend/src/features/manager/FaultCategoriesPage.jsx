import {authMode} from '../../services/auth/mode'
import {FaultCategoriesApi} from './api/FaultCategoriesApi'
import { CheckCircle2, Layers3, Pencil, Plus, Search } from 'lucide-react'
import { useReducer, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { mockFaultCategoryService } from '../../services/mock/mockFaultCategoryService'
import { mockTicketService } from '../../services/mock/mockTicketService'

const emptyEditor = { type: 'category', id: null, categoryId: null, name: '' }

function MockFaultCategoriesPage() {
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [, refresh] = useReducer((value) => value + 1, 0)
  const categories = mockFaultCategoryService.search(search)
  const tickets = mockTicketService.getAll()

  const save = (event) => {
    event.preventDefault()
    const result = editor.type === 'category'
      ? editor.id ? mockFaultCategoryService.update(editor.id, editor.name) : mockFaultCategoryService.add(editor.name)
      : editor.id ? mockFaultCategoryService.updateSubcategory(editor.categoryId, editor.id, editor.name) : mockFaultCategoryService.addSubcategory(editor.categoryId, editor.name)
    if (result) { setEditor(null); refresh() }
  }
  const toggleCategory = (category) => {
    const action = category.active ? 'تعطيل' : 'تفعيل'
    if (window.confirm(`هل تريد ${action} التصنيف «${category.name}»؟ لن تتغير بيانات التذاكر التاريخية.`)) { mockFaultCategoryService.setActive(category.id, !category.active); refresh() }
  }
  const toggleSubcategory = (category, subcategory) => {
    const action = subcategory.active ? 'تعطيل' : 'تفعيل'
    if (window.confirm(`هل تريد ${action} التصنيف الفرعي «${subcategory.name}»؟`)) { mockFaultCategoryService.setSubcategoryActive(category.id, subcategory.id, !subcategory.active); refresh() }
  }

  return <div className="mx-auto max-w-7xl">
    <div className="page-heading"><div><p className="eyebrow">البيانات الأساسية</p><h1>تصنيفات الأعطال</h1><p>أدر التصنيفات الرئيسية والفرعية المتاحة عند إنشاء طلب جديد.</p></div><Button onClick={() => setEditor(emptyEditor)}><Plus size={18} />إضافة تصنيف رئيسي</Button></div>
    <div className="content-card mb-6"><label><span className="field-label">البحث في التصنيفات</span><span className="relative block"><Search size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="field-input pr-11" placeholder="اسم التصنيف الرئيسي أو الفرعي" /></span></label></div>

    {editor && <form onSubmit={save} className="content-card mb-6"><h2 className="text-lg font-extrabold text-ink">{editor.id ? 'تعديل' : 'إضافة'} {editor.type === 'category' ? 'تصنيف رئيسي' : 'تصنيف فرعي'}</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="field-label">الاسم</span><input autoFocus value={editor.name} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} className="field-input" required /></label><div className="flex items-end gap-3"><Button type="submit" disabled={!editor.name.trim()}><CheckCircle2 size={18} />حفظ</Button><Button type="button" variant="secondary" onClick={() => setEditor(null)}>إلغاء</Button></div></div></form>}

    {categories.length ? <div className="grid gap-5 lg:grid-cols-2">{categories.map((category) => {
      const categoryCount = tickets.filter((ticket) => ticket.category === category.name).length
      return <article key={category.id} className="content-card"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-200"><Layers3 size={20} /></span><div><h2 className="font-extrabold text-ink">{category.name}</h2><p className="mt-1 text-xs text-muted">{categoryCount} تذكرة مرتبطة · {category.subcategories.length} تصنيف فرعي</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${category.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{category.active ? 'نشط' : 'غير نشط'}</span></div>
        <div className="mt-5 space-y-2">{category.subcategories.map((subcategory) => { const count = tickets.filter((ticket) => ticket.category === category.name && ticket.subcategory === subcategory.name).length; return <div key={subcategory.id} className="flex flex-col gap-3 rounded-xl bg-canvas p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-ink">{subcategory.name}</p><p className="mt-1 text-xs text-muted">{count} تذكرة · {subcategory.active ? 'نشط' : 'غير نشط'}</p></div><div className="flex gap-3"><button type="button" onClick={() => setEditor({ type: 'subcategory', id: subcategory.id, categoryId: category.id, name: subcategory.name })} className="text-xs font-extrabold text-primary-600">تعديل</button><button type="button" onClick={() => toggleSubcategory(category, subcategory)} className="text-xs font-extrabold text-primary-600">{subcategory.active ? 'تعطيل' : 'تفعيل'}</button></div></div> })}{!category.subcategories.length && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">لا توجد تصنيفات فرعية.</p>}</div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4"><Button variant="secondary" onClick={() => setEditor({ type: 'category', id: category.id, categoryId: null, name: category.name })}><Pencil size={16} />تعديل الرئيسي</Button><Button variant="secondary" onClick={() => setEditor({ type: 'subcategory', id: null, categoryId: category.id, name: '' })}><Plus size={16} />إضافة فرعي</Button><Button variant="secondary" onClick={() => toggleCategory(category)}>{category.active ? 'تعطيل التصنيف' : 'تفعيل التصنيف'}</Button></div>
      </article>
    })}</div> : <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><Layers3 className="mx-auto text-primary-300" size={40} /><h2 className="mt-4 font-extrabold text-ink">لا توجد تصنيفات مطابقة</h2><p className="mt-2 text-sm text-muted">جرّب تغيير كلمة البحث.</p></section>}
  </div>
}

export function FaultCategoriesPage(){return authMode === 'api' ? <FaultCategoriesApi/> : <MockFaultCategoriesPage/>}
