/**
 * NavSidebar.jsx - Navigation Sidebar
 *
 * Fixed-position sidebar navigation. The visual palette stays in App.css;
 * this component only controls grouping and route links.
 */
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Settings,
  Users,
} from 'lucide-react'
import geosentriIcon from '../assets/geosentri-icon.png'

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
      {
        to: '/deployments',
        icon: ClipboardList,
        label: 'Assigned Deployments',
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
        <span className="nav-sidebar__badge">
          <img src={geosentriIcon} alt="" aria-hidden="true" />
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
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
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

      <button
        type="button"
        className="nav-sidebar__toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
        title={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
      >
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </button>
    </aside>
  )
}

export default NavSidebar
