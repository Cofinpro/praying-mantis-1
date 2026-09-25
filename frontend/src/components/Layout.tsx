import { Outlet } from 'react-router'
import { TopBar } from './TopBar'
import styles from './Layout.module.css'

// Parent route element: <Outlet /> renders the matched child route, like <router-view> in Vue.
export function Layout() {
  return (
    <>
      <TopBar />
      <main className={styles.content}>
        <Outlet />
      </main>
    </>
  )
}
