import Link from "next/link";

type EventCardData = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  tag: string;
  availability: "Open" | "Limited" | "Closed";
};

const events: EventCardData[] = [
  { id: "community-design-lab", title: "Community Design Lab", date: "18 Oct 2026", time: "10:00 AM – 1:00 PM", location: "Innovation Hall, Singapore", description: "A practical morning for turning community ideas into useful, human-centred solutions.", tag: "Workshop", availability: "Open" },
  { id: "future-of-cities", title: "The Future of Cities", date: "24 Oct 2026", time: "6:30 PM – 8:30 PM", location: "The Foundry, Singapore", description: "Hear local builders and researchers share what makes a city more connected and resilient.", tag: "Talk", availability: "Limited" },
  { id: "makers-open-house", title: "Makers Open House", date: "02 Nov 2026", time: "11:00 AM – 4:00 PM", location: "Harbourfront Studio", description: "Explore hands-on demonstrations, creative technology and the people building what comes next.", tag: "Open house", availability: "Closed" },
];

const availabilityClass = { Open: "status-open", Limited: "status-limited", Closed: "status-closed" };

export default function Home() {
  return (
    <main>
      <nav className="site-nav shell" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="ConnectSphere home"><span className="brand-mark" aria-hidden="true">C</span><span>ConnectSphere</span></Link>
        <div className="nav-links"><Link className="nav-link nav-link-active" href="/">Discover events</Link><Link className="nav-link" href="#about">About us</Link></div>
        <div className="nav-actions"><Link className="button button-quiet" href="/login">Log in</Link><Link className="button button-dark" href="/signup">Get started <span aria-hidden="true">↗</span></Link></div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow"><span className="eyebrow-dot" /> Discover what&apos;s happening</div>
        <h1>Make space for<br /><em>something meaningful.</em></h1>
        <p className="hero-copy">Find gatherings, conversations and experiences designed to bring people closer to the ideas that matter.</p>
        <div className="hero-meta"><span>✦ 24 events this month</span><span>⌖ Singapore &amp; online</span></div>
      </section>

      <section className="event-section shell" aria-labelledby="events-heading">
        <div className="section-heading"><div><p className="section-kicker">Curated for you</p><h2 id="events-heading">Upcoming events</h2></div><button className="filter-button" type="button">All events <span aria-hidden="true">⌄</span></button></div>
        <div className="event-grid">
          {events.map((event) => <article className="event-card" key={event.id}>
            <div className="card-art" aria-hidden="true"><span>{event.tag.slice(0, 1)}</span><div className="art-orbit" /></div>
            <div className="card-content"><div className="card-topline"><span className="event-tag">{event.tag}</span><span className={`availability ${availabilityClass[event.availability]}`}><span />{event.availability}</span></div><h3>{event.title}</h3><p className="card-description">{event.description}</p><div className="event-details"><span>◷ {event.date}</span><span>◴ {event.time}</span><span>⌖ {event.location}</span></div><Link className="card-link" href={`/events/${event.id}`}>View event <span aria-hidden="true">↗</span></Link></div>
          </article>)}
        </div>
        <div className="empty-hint"><span>✦</span><p>Looking for something specific? More events and filters are coming soon.</p></div>
      </section>

      <section className="callout shell" id="about"><div><p className="section-kicker">There&apos;s room for you here</p><h2>Show up curious.<br /><em>Leave more connected.</em></h2></div><Link className="button button-light" href="/signup">Join ConnectSphere <span aria-hidden="true">↗</span></Link></section>
      <footer className="site-footer shell"><span>© 2026 ConnectSphere</span><span>Built for meaningful connection.</span></footer>
    </main>
  );
}
