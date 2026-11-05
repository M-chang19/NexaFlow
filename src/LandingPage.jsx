import "./landing.css";

const features = [
  {
    number: "01",
    icon: "✦",
    title: "Get unstuck on the next step",
    description: "Break a big or messy problem into a small action. The optional assistant can help you think it through."
  },
  {
    number: "02",
    icon: "▦",
    title: "Keep plans from getting scattered",
    description: "Bring projects, tasks, notes, and due dates together, then find them quickly with search and filters."
  },
  {
    number: "03",
    icon: "◷",
    title: "Make room for focused work",
    description: "Choose one task, start a focus session, and return to your plan without juggling another tool."
  }
];

function Logo() {
  return (
    <a className="landing-logo" href="/" aria-label="NexaFlow home">
      <span className="landing-logo-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>Nexa<span>Flow</span></span>
    </a>
  );
}

function WorkspacePreview() {
  return (
    <div className="preview-frame" role="img" aria-label="Illustration of the NexaFlow workspace">
      <div className="preview-window-bar" aria-hidden="true">
        <span /><span /><span />
        <div className="preview-address">nexaflow / overview</div>
      </div>
      <div className="preview-workspace">
        <aside className="preview-sidebar" aria-hidden="true">
          <div className="preview-mini-brand"><span className="preview-brand-mark">✳</span> NexaFlow</div>
          <div className="preview-nav active"><span>◫</span> Overview</div>
          <div className="preview-nav"><span>✓</span> My tasks</div>
          <div className="preview-nav"><span>▦</span> Projects</div>
          <div className="preview-nav"><span>▤</span> Notes</div>
          <div className="preview-sidebar-foot"><span className="preview-avatar">Y</span><span>Your workspace<br /><small>Personal space</small></span></div>
        </aside>
        <div className="preview-main">
          <div className="preview-topline"><span>YOUR WORKSPACE</span><span className="preview-save"><i /> Saved</span></div>
          <div className="preview-heading">A little progress<br />goes a long way.</div>
          <p className="preview-subheading">Here’s a clear place to begin today.</p>
          <div className="preview-card">
            <div className="preview-card-label"><i /> YOUR NEXT CHAPTER</div>
            <strong>Make room for<br />what matters.</strong>
            <p>One thoughtful step at a time.</p>
            <span className="preview-card-button">See your projects <b>→</b></span>
            <div className="preview-orbit" aria-hidden="true"><span>✳</span></div>
          </div>
          <div className="preview-lower">
            <div className="preview-stat"><span>IN PROGRESS</span><strong>03</strong><i>across your projects</i></div>
            <div className="preview-task"><span className="preview-check">✓</span><span><b>Write down the first idea</b><small>Personal project · Today</small></span></div>
          </div>
        </div>
      </div>
      <div className="preview-float preview-float-note"><span>✦</span><div><b>A thought worth keeping</b><small>Saved with your project</small></div></div>
      <div className="preview-float preview-float-focus"><span>◷</span><div><b>One thing at a time</b><small>Your focus session is ready</small></div></div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Logo />
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-helps">How it helps</a>
          <a href="#your-data">Your data</a>
        </nav>
        <a className="landing-header-cta" href="/workspace">Open workspace <span aria-hidden="true">↗</span></a>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><span /> A CALMER WAY TO GET THINGS DONE</div>
            <h1>Make space for<br />what <em>matters.</em></h1>
            <p className="landing-lede">Projects, tasks, and ideas—together in one thoughtful workspace. Find your next step and move forward at your own pace.</p>
            <div className="landing-actions">
              <a className="landing-primary-button" href="/workspace">Open your workspace <span aria-hidden="true">→</span></a>
              <a className="landing-text-link" href="#how-it-helps">Take a look around <span aria-hidden="true">↓</span></a>
            </div>
            <div className="landing-reassurance"><span aria-hidden="true">◉</span> Local-first <i /> Offline-ready <i /> AI is optional</div>
          </div>
          <WorkspacePreview />
          <div className="landing-hero-decoration" aria-hidden="true">✳</div>
        </section>

        <section className="landing-principles" aria-label="NexaFlow at a glance">
          <p>LESS SCATTERED. MORE PRESENT.</p>
          <div><span>Projects</span><i>✳</i><span>Tasks</span><i>✳</i><span>Notes</span><i>✳</i><span>Focus</span></div>
        </section>

        <section className="landing-features" id="how-it-helps">
          <div className="landing-section-heading">
            <div className="landing-eyebrow"><span /> A WORKSPACE THAT STAYS OUT OF YOUR WAY</div>
            <h2>Everything has a place.<br /><em>Nothing has to be perfect.</em></h2>
            <p>Start with what’s on your mind. Shape it into a plan when you’re ready.</p>
          </div>
          <div className="landing-feature-grid">
            {features.map(feature => (
              <article className="landing-feature" key={feature.number}>
                <div className="landing-feature-top"><span className="landing-feature-icon" aria-hidden="true">{feature.icon}</span><span className="landing-feature-number">{feature.number}</span></div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-data" id="your-data">
          <div className="landing-data-symbol" aria-hidden="true"><span>◉</span><i /><i /><i /></div>
          <div>
            <div className="landing-eyebrow"><span /> YOUR WORKSPACE, YOURS</div>
            <h2>Thoughtful about<br /><em>where your work lives.</em></h2>
            <p>NexaFlow saves your workspace on your own machine and keeps working offline. AI is optional; only messages you choose to send are shared with your configured provider.</p>
            <a className="landing-data-link" href="/workspace">Explore the workspace <span aria-hidden="true">→</span></a>
          </div>
          <div className="landing-data-note"><span>✦</span><p>Good work takes time.<br /><b>Give it a little room.</b></p></div>
        </section>
      </main>

      <footer className="landing-footer">
        <Logo />
        <span>A little more room to think.</span>
        <a href="/workspace">Open workspace <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  );
}
