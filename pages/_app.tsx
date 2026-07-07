import type { AppProps } from 'next/app'
import '@excalidraw/excalidraw/index.css'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
