"use client"

import { useState } from "react"
import { LogInIcon, LogOutIcon, UserIcon, ShieldAlertIcon } from "lucide-react"

export interface UserSession {
  user: {
    name: string
    email: string
    avatar?: string
  } | null
}

export function AuthPanel({
  session,
  onLogin,
  onLogout,
}: {
  session: UserSession
  onLogin: (email: string, name: string) => void
  onLogout: () => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [showLoginModal, setShowLoginModal] = useState(false)

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      onLogin(email, name || email.split("@")[0])
      setShowLoginModal(false)
    }
  }

  return (
    <div className="relative z-40">
      {session.user ? (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-zinc-300">
          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white uppercase text-[10px]">
            {session.user.name[0]}
          </div>
          <span className="font-medium truncate max-w-[80px]">{session.user.name}</span>
          <button
            onClick={onLogout}
            title="Log Out"
            className="text-zinc-500 hover:text-red-400 transition-colors ml-1"
          >
            <LogOutIcon size={12} />
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/10"
          >
            <LogInIcon size={12} />
            Sign In
          </button>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl relative">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 mb-1">
              <UserIcon size={16} className="text-indigo-400" />
              Sign in to Spec-Design Yard
            </h3>
            <p className="text-[11px] text-zinc-500 mb-4 leading-normal">
              Sign in to synchronize your YAML specs and sketchy Excalidraw layouts to the Postgres cloud database.
            </p>

            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="tomer@neuronbox.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">Display Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Tomer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-sans"
                >
                  Sign In
                </button>
              </div>
            </form>

            <div className="mt-4 pt-4 border-t border-zinc-850 flex items-start gap-2">
              <ShieldAlertIcon size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-zinc-500 leading-normal">
                <span className="text-emerald-400 font-semibold">Postgres Integration Active:</span> Login triggers user-scoped spec persistence inside the `Spec` and `User` database tables.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
