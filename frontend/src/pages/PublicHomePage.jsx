import { ArrowRight, ClipboardCheck, MapPinned, ShieldCheck } from 'lucide-react'
import { createElement } from 'react'
import { Link } from 'react-router-dom'
import pnpLogo from '../assets/pnp-logo.png'

const capabilities = [
  {
    icon: MapPinned,
    title: 'Operational awareness',
    description: 'Authorized supervisors can monitor personnel status and field activity from one secure workspace.',
  },
  {
    icon: ShieldCheck,
    title: 'Deployment coordination',
    description: 'Deployment assignments and geofencing alerts help teams coordinate police operations in Cabagan.',
  },
  {
    icon: ClipboardCheck,
    title: 'Organized reporting',
    description: 'Patrol and incident reports support clear records and informed operational decisions.',
  },
]

function PublicHomePage() {
  return (
    <div className="public-home">
      <header className="public-home__header">
        <Link className="public-home__brand" to="/" aria-label="GeoSentri home">
          <img src={pnpLogo} alt="Philippine National Police seal" />
          <span>
            <strong>GeoSentri</strong>
            <small>Cabagan Police Station</small>
          </span>
        </Link>
        <Link className="public-home__signin public-home__signin--header" to="/login">
          Authorized sign in
        </Link>
      </header>

      <main>
        <section className="public-home__hero" aria-labelledby="public-home-title">
          <div className="public-home__hero-copy">
            <p className="public-home__eyebrow">Police Personnel Monitoring System</p>
            <h1 id="public-home-title">Operational visibility for a safer Cabagan.</h1>
            <p className="public-home__intro">
              GeoSentri is the secure web and mobile operations portal of the Cabagan Police Station
              in Isabela. It supports authorized personnel monitoring, deployment coordination,
              geofencing alerts, and operational reporting.
            </p>
            <Link className="public-home__signin public-home__signin--primary" to="/login">
              Sign in to GeoSentri <ArrowRight aria-hidden="true" />
            </Link>
            <p className="public-home__access-note">
              Access is restricted to authorized police personnel and administrators.
            </p>
          </div>

          <aside className="public-home__identity" aria-label="GeoSentri system identity">
            <img src={pnpLogo} alt="" aria-hidden="true" />
            <span>Official Operations Portal</span>
            <strong>Cabagan Police Station</strong>
            <p>Cabagan, Isabela, Philippines</p>
          </aside>
        </section>

        <section className="public-home__capabilities" aria-labelledby="capabilities-title">
          <div className="public-home__section-heading">
            <p className="public-home__eyebrow">System capabilities</p>
            <h2 id="capabilities-title">Built for coordinated police operations</h2>
          </div>
          <div className="public-home__capability-grid">
            {capabilities.map(({ icon, title, description }) => (
              <article className="public-home__capability" key={title}>
                <span className="public-home__capability-icon">
                  {createElement(icon, { 'aria-hidden': true })}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="public-home__footer">
        <span>GeoSentri</span>
        <span>Cabagan Police Station Operations Portal</span>
      </footer>
    </div>
  )
}

export default PublicHomePage
