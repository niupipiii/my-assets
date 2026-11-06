import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import { latestSnapshot } from '../../domain/selectors'
import { formatMoney, parseAmount } from '../../domain/money'
import type { Account, CategoryKey } from '../../domain/types'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'
import { CategoryIcon } from '../../components/CategoryIcon'

interface Draft {
  name: string
  category: CategoryKey
  institution: string
  tags: string
  note: string
}

const EMPTY: Draft = { name: '', category: 'cash', institution: '', tags: '', note: '' }

export function AccountsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setShowArchived(false)
    }
  }, [open])

  useEffect(() => {
    if (editing === 'new') setDraft({ ...EMPTY })
    else if (editing) {
      setDraft({
        name: editing.name,
        category: editing.category,
        institution: editing.institution ?? '',
        tags: editing.tags.join(', '),
        note: editing.note ?? '',
      })
    }
  }, [editing])

  const latest = latestSnapshot(ledger)
  const visible = ledger.accounts.filter((account) => showArchived || !account.archived)

  const openNew = () => setEditing('new')

  const save = () => {
    const name = draft.name.trim()
    if (!name) {
      toast.show('请填写账户名称')
      return
    }
    const tags = draft.tags
      .split(/[,，、\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (editing === 'new') {
      const id = actions.addAccount({
        name,
        category: draft.category,
        institution: draft.institution,
        tags,
        note: draft.note,
      })
      if (!id) {
        toast.show('同一分类下已有同名账户')
        return
      }
      toast.show('账户已添加')
    } else if (editing) {
      const conflict = ledger.accounts.some(
        (account) =>
          account.id !== editing.id &&
          account.category === draft.category &&
          account.name.trim() === name,
      )
      if (conflict) {
        toast.show('同一分类下已有同名账户')
        return
      }
      actions.updateAccount(editing.id, {
        name,
        category: draft.category,
        institution: draft.institution.trim() || undefined,
        tags,
        note: draft.note.trim() || undefined,
      })
      toast.show('已保存')
    }
    setEditing(null)
  }

  const remove = () => {
    if (!editing || editing === 'new') return
    const balance = latest?.balances[editing.id] ?? 0
    if (balance !== 0) {
      toast.show('该账户还有余额，只能归档，不能删除')
      return
    }
    if (!window.confirm(`删除账户「${editing.name}」？历史中没有余额记录。`)) return
    const ok = actions.deleteAccount(editing.id)
    if (!ok) toast.show('该账户有历史余额，只能归档')
    else {
      toast.show('账户已删除')
      setEditing(null)
    }
  }

  const toggleArchive = () => {
    if (!editing || editing === 'new') return
    actions.archiveAccount(editing.id, !editing.archived)
    setEditing(null)
    toast.show(editing.archived ? '已恢复账户' : '已归档账户')
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        full
        title="账户管理"
        subtitle={`${ledger.accounts.filter((a) => !a.archived).length} 个在用账户`}
        headerRight={
          <>
            <button className="icon-btn" onClick={() => setShowArchived((value) => !value)} aria-label="显示归档">
              <ChevronDown size={17} style={{ opacity: showArchived ? 1 : 0.45 }} />
            </button>
            <button className="icon-btn" onClick={openNew} aria-label="添加账户">
              <Plus size={18} />
            </button>
          </>
        }
        footer={
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={openNew}>
            <Plus size={17} /> 添加账户
          </button>
        }
      >
        {visible.length === 0 && (
          <div className="card">
            <div className="small muted" style={{ textAlign: 'center', padding: 20 }}>
              还没有账户。添加"招商银行""微信零钱""A股"等账户后，就可以按月记录余额。
            </div>
          </div>
        )}
        {CATEGORIES.map((category) => {
          const accounts = visible
            .filter((account) => account.category === category.key)
            .sort((a, b) => a.order - b.order)
          if (accounts.length === 0) return null
          return (
            <div key={category.key} style={{ marginTop: 14 }}>
              <div className="section-title" style={{ margin: '0 2px 6px' }}>
                {category.label}
                <span className="tiny faint">{accounts.length}</span>
              </div>
              <div className="list">
                {accounts.map((account) => {
                  const balance = latest?.balances[account.id] ?? 0
                  return (
                    <button key={account.id} className="list-row" onClick={() => setEditing(account)}>
                      <CategoryIcon category={account.category} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {account.name}
                          {account.archived && (
                            <span className="pill" style={{ fontSize: 9, padding: '2px 6px' }}>
                              已归档
                            </span>
                          )}
                        </div>
                        <div className="tiny faint">
                          {[account.institution, ...account.tags].filter(Boolean).join(' · ') || '无标签'}
                        </div>
                      </div>
                      <span className="money small" style={{ fontWeight: 650, color: 'var(--text-2)' }}>
                        {formatMoney(balance)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        <p className="tiny faint" style={{ margin: '18px 4px 0', lineHeight: 1.5 }}>
          改名不会影响历史记录；有余额的账户只能归档，不能直接删除。点右上角漏斗显示/隐藏已归档。
        </p>
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? '添加账户' : '编辑账户'}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            {editing !== null && editing !== 'new' && (
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={remove}>
                <Trash2 size={16} /> 删除
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>
              保存
            </button>
          </div>
        }
      >
        <div className="card" style={{ padding: 14 }}>
          <label>
            <span className="field-label">名称</span>
            <input
              className="input"
              placeholder="例如：招商银行 / A股 / 自住房产"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="field-label">分类</span>
            <select
              className="input"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value as CategoryKey })}
            >
              {CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="field-label">机构（可选）</span>
            <input
              className="input"
              placeholder="招商银行 / 微信 / 支付宝"
              value={draft.institution}
              onChange={(event) => setDraft({ ...draft, institution: event.target.value })}
            />
          </label>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="field-label">标签（逗号分隔，可选）</span>
            <input
              className="input"
              placeholder="流动资金, 长期"
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            />
          </label>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="field-label">备注（可选）</span>
            <input
              className="input"
              placeholder="例如：工资卡"
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </label>
        </div>

        {editing !== null && editing !== 'new' && (
          <div className="card" style={{ padding: 14 }}>
            <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
              其他操作
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, minHeight: 40, fontSize: 14 }}
                onClick={() => actions.moveAccount(editing.id, -1)}
              >
                <ChevronUp size={15} /> 上移
              </button>
              <button
                className="btn"
                style={{ flex: 1, minHeight: 40, fontSize: 14 }}
                onClick={() => actions.moveAccount(editing.id, 1)}
              >
                <ChevronDown size={15} /> 下移
              </button>
              <button className="btn" style={{ flex: 1, minHeight: 40, fontSize: 14 }} onClick={toggleArchive}>
                {editing.archived ? '恢复' : '归档'}
              </button>
            </div>
            <p className="tiny faint" style={{ margin: '10px 2px 0', lineHeight: 1.5 }}>
              当前最新余额 {formatMoney(latest?.balances[editing.id] ?? 0)}。归档后不再出现在记账页，但历史仍保留。
            </p>
          </div>
        )}
        <p className="tiny faint" style={{ margin: '14px 4px 0' }}>
          {categoryOf(draft.category).label} · 账户会在记账页按分类显示
        </p>
      </Sheet>
    </>
  )
}
