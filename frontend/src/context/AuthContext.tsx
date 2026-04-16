import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../lib/api'
import type { RegisterEmailSendPayload } from '../lib/api'

type Me = {
  id: number
  email: string
  phone?: string | null
  first_name?: string
  last_name?: string
  niche?: string | null
}

type AuthCtx = {
  me: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  requestRegisterEmail: (
    body: RegisterEmailSendPayload,
  ) => Promise<{ ok: boolean; detail: string; expires_in_minutes?: number; debug_code?: string | null }>
  completeRegisterEmail: (email: string, code: string) => Promise<void>
  requestRegisterSms: (
    email: string,
    password: string,
    phone: string,
  ) => Promise<{ ok: boolean; detail: string; debug_code?: string | null }>
  completeRegisterSms: (email: string, code: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    if (!api.getToken()) {
      setMe(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const m = await api.fetchMe()
      setMe(m)
    } catch {
      api.clearToken()
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.loginRequest(email, password)
    api.setToken(access_token)
    await refreshMe()
  }, [refreshMe])

  const requestRegisterEmail = useCallback(async (body: RegisterEmailSendPayload) => {
    return api.registerEmailSend(body)
  }, [])

  const completeRegisterEmail = useCallback(
    async (email: string, code: string) => {
      const { access_token } = await api.registerEmailVerify(email, code)
      api.setToken(access_token)
      await refreshMe()
    },
    [refreshMe],
  )

  const requestRegisterSms = useCallback(
    async (email: string, password: string, phone: string) => {
      return api.registerSmsSend(email, password, phone)
    },
    [],
  )

  const completeRegisterSms = useCallback(
    async (email: string, code: string) => {
      const { access_token } = await api.registerSmsVerify(email, code)
      api.setToken(access_token)
      await refreshMe()
    },
    [refreshMe],
  )

  const logout = useCallback(() => {
    api.clearToken()
    setMe(null)
  }, [])

  const value = useMemo(
    () => ({
      me,
      loading,
      login,
      requestRegisterEmail,
      completeRegisterEmail,
      requestRegisterSms,
      completeRegisterSms,
      logout,
      refreshMe,
    }),
    [
      me,
      loading,
      login,
      requestRegisterEmail,
      completeRegisterEmail,
      requestRegisterSms,
      completeRegisterSms,
      logout,
      refreshMe,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
