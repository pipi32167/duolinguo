import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/State'
import { LingoMark } from '../components/Icons'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="app">
      <main className="app-main">
        <div className="page page--narrow">
          <div style={{ paddingTop: 24 }}>
            <span className="brandmark brandmark--sm">
              <LingoMark size={26} />
            </span>
          </div>
          <EmptyState
            icon={<LingoMark size={28} />}
            title="这个页面不存在"
            hint="地址可能拼错了，或者这个功能还没做。"
            action={
              <button className="btn" onClick={() => navigate('/learn')}>
                回到学习页
              </button>
            }
          />
        </div>
      </main>
    </div>
  )
}
