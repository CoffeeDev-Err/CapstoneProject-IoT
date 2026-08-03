/**
 * NavSidebar.jsx - Navigation Sidebar
 *
 * Fixed-position sidebar navigation. The visual palette stays in App.css;
 * this component only controls grouping and route links.
 */
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  PenLine,
  Settings,
  Users,
} from 'lucide-react'
import pnpLogo from '../assets/pnp-logo.png'

const navSections = [
  {
    title: 'Overview',
    items: [
      {
        to: '/',
        icon: MapIcon,
        label: 'Live Map',
      },
      {
        to: '/monitoring',
        icon: LayoutDashboard,
        label: 'Dashboard',
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        to: '/personnel',
        icon: Users,
        label: 'Personnel',
      },
      {
        to: '/assign-area',
        icon: PenLine,
        label: 'Deployment Management',
      },
    ],
  },
  {
    title: 'Analytics',
    items: [
      {
        to: '/analytics',
        label: 'Analytics',
        icon: BarChart3,
      },
      {
        to: '/reports',
        label: 'Reports',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      {
        to: '/settings',
        icon: Settings,
        label: 'Account Management',
      },
    ],
  },
]

function NavSidebar({ collapsed, onToggle }) {
  const handleNavItemClick = (item) => {
    if (item.to === '/' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('focus-live-map'))
    }
  }

  return (
    <aside className={`nav-sidebar ${collapsed ? 'nav-sidebar--collapsed' : ''}`}>
      <div className="nav-sidebar__brand">
        <span className="nav-sidebar__badge mb-2">
          <img src={pnpLogo} alt="Philippine National Police seal" />
        </span>
        {!collapsed && <span className="nav-sidebar__brand-name fs-4">GeoSentri</span>}
      </div>

      <nav className="nav-sidebar__nav mt-4">
        {navSections.map((section) => (
          <div className="nav-sidebar__section" key={section.title}>
            {!collapsed && <span className="nav-sidebar__section-title">{section.title}</span>}
            <div className="nav-sidebar__section-links">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => handleNavItemClick(item)}
                    className={({ isActive }) =>
                      `nav-sidebar__link ${isActive ? 'nav-sidebar__link--active' : ''}`
                    }
                  >
                    <span className="nav-sidebar__icon"><Icon aria-hidden="true" /></span>
                    {!collapsed && <span className="nav-sidebar__label">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <button type="button" className="nav-sidebar__toggle" onClick={onToggle} aria-label="Toggle sidebar">
        {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>
    </aside>
  )
}

export default NavSidebar
