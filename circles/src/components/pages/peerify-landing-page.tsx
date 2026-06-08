"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect } from "react"

// ─── Stats ────────────────────────────────────────────────────────────────────
// TODO: replace with appConfig.stats once wired to the database
// import { appConfig } from "@/config/app"
const STATS = {
    artists: 847,
    members: 2341,
    venues: 134,
}

// ─── Feature cards ────────────────────────────────────────────────────────────
const FEATURES = [
    {
        tag: "Fans & artists",
        title: "Map-based discovery",
        body: "Browse artists worldwide or filter by your city, genre, or touring status. See pledge campaigns building in real time. No algorithm — just geography and music.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>,
    },
    {
        tag: "The core mechanic",
        title: "Pledge to bring them here",
        body: "Found an artist you want to bring to your city? Start or join a pledge campaign. When it tips, a tour team forms and the show moves from possibility to plan.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
    },
    {
        tag: "Fair economics",
        title: "Buy music directly",
        body: "Peerify is not a streaming site. When you buy music here, it’s yours. The artist receives 90% of the price. Your €5/month membership includes €4 in music credit.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    },
    {
        tag: "Coming soon",
        title: "The Peerify Player",
        body: "Your personal collection. When you’re in close proximity to another listener, you can share the music you own with them. All plays are recorded, and Peerify surplus becomes royalties for the artists.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8,6 8,18 19,12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
        tag: "Tour support",
        title: "Join the tour team",
        body: "When a pledge campaign hits 10%, a tour team forms. Offer a spare room, a meal, transport, or a stage. Community makes tours possible, and you get to make new friends along the way.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    },
    {
        tag: "For hosts",
        title: "Host a house concert",
        body: "Open your living room to live music. Set the capacity, vet your guests, and share the address only with people you’ve approved. Intimate music in the places it belongs.",
        icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    },
]

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
    { n: "01", title: "Discover on the map",    body: "Browse artists worldwide or filter by your city, genre, or touring status. Find someone whose music you love and who hasn’t played near you yet." },
    { n: "02", title: "Pledge to bring them",   body: "Start or join a pledge campaign. Watch it grow. When it tips, a tour team forms and the show moves from possibility to real life." },
    { n: "03", title: "Help make it happen",    body: "Offer a spare room, a meal, transport, or a space to play. The tour team builds the tour together with the artists. Peer-to-peer all the way through." },
    { n: "04", title: "Show up & support", body: "Attend the show, buy the record, spread the word. Your membership credit goes directly to artists. Every purchase, every play counts." },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function PeerifyLandingPage() {
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible") }),
            { threshold: 0.1 }
        )
        document.querySelectorAll(`.${"reveal"}`).forEach((el) => observer.observe(el))
        return () => observer.disconnect()
    }, [])

    return (
        <div className="peerify-home page">

            {/* ── HERO ── */}
            <section className={"hero"}>
                <div className={"heroBg"} />
                <div className={"heroOverlay"} />
                <div className={"heroInner"}>
                    <div className={"logoLockup"}>
                        <Image src="/peerify/logo-mark.png" alt="Peerify mark" width={42} height={42} priority />
                        <div className={"logoText"}>Peer<span>ify</span></div>
                    </div>
                    <h1 className={"heroHeading"}>
                        The next stage<br />of <em>music.</em>
                    </h1>
                    <p className={"heroSub"}>
                        A peer-to-peer, non-profit platform connecting artists, fans, and living rooms.
                        Browse artists on a map. Pledge to bring them to your city. Host a show at home.
                    </p>
                    <div className={"heroActions"}>
                        <Link href="/explore" className={"btnOrange"}>Explore the map</Link>
                        <Link href="/signup/pilot" className={"btnGhost"}>Join the prototype</Link>
                    </div>
                </div>
            </section>

            {/* ── THE IDEA ── */}
            <section className={"ideaSection reveal"} id="discover">
                <div className={"inner"}>
                    <div className={"twoCol"}>
                        <div className={"textCol"}>
                            <p className={"sLabel"}>The idea</p>
                            <h2 className={"serif"}>A map of music<br />happening near you</h2>
                            <p>Peerify starts with a map — not an algorithm. Every artist, every home concert, every pledge campaign has a place on it. Browse by location, genre, or tour route. Find music that belongs to your city.</p>
                            <p>When you find an artist you love who hasn’t played your city yet, you pledge to bring them. When enough fans pledge, the show becomes real. It’s that simple.</p>
                            <Link href="/explore" className={"btnOrange"} style={{ marginTop: "8px" }}>See the map</Link>
                        </div>
                        <div className={"photoFrame"}>
                            <Image src="/peerify/fans.jpg" alt="Fans at an intimate house concert" fill className={"photoImg"} sizes="(max-width: 768px) 100vw, 50vw" />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className={"featuresSection reveal"} id="features">
                <div className={"inner"}>
                    <p className={"sLabel"}>What makes Peerify different</p>
                    <h2 className={"serif"}>Discovery, support,<br />connections and community.</h2>
                    <div className={"featuresGrid"}>
                        {FEATURES.map((f) => (
                            <div key={f.title} className={"featureCard"}>
                                <span className={"featureIcon"}>{f.icon}</span>
                                <h3>{f.title}</h3>
                                <p>{f.body}</p>
                                <span className={"featureTag"}>{f.tag}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── ROLES ── */}
            <section className={"rolesSection reveal"} id="artists">
                <div className={"inner"}>
                    <p className={"sLabel"} style={{ color: "#e8720c" }}>Growing Peerify</p>
                    <h2 className={"serif serifLight"}>The roles you can play.</h2>
                    <div className={"rolesGrid"}>

                        <div className={"roleCard"}>
                            <div className={"roleImageWrap"}>
                                <Image src="/peerify/fans.jpg" alt="Artist performing at a house concert" fill className={"roleImg"} sizes="(max-width: 768px) 100vw, 33vw" />
                            </div>
                            <div className={"roleBody"}>
                                <p className={"roleType"}>For Artists</p>
                                <h3>Micro-gigs, home concerts &amp; community-backed touring</h3>
                                <ul>
                                    <li>Earn 90% on every music sale</li>
                                    <li>Let fans pledge tours into existence</li>
                                    <li>Sell tickets to intimate events</li>
                                    <li>Fan-club tools &amp; direct messaging</li>
                                    <li>First 1,000 artists free for 3 years</li>
                                </ul>
                                <Link href="/signup/pilot" className={"roleCta"}>Create an artist profile &rarr;</Link>
                            </div>
                        </div>

                        <div className={"roleCard"}>
                            <div className={"roleImageWrap"}>
                                <Image src="/peerify/artist.jpg" alt="Fans enjoying a house concert" fill className={"roleImg"} sizes="(max-width: 768px) 100vw, 33vw" />
                            </div>
                            <div className={"roleBody"}>
                                <p className={"roleType"}>For Fans &amp; Members</p>
                                <h3>Discover, support &amp; experience music differently</h3>
                                <ul>
                                    <li>&euro;5/month includes &euro;4 music credit</li>
                                    <li>Pledge to bring artists to your city</li>
                                    <li>Attend intimate house concerts</li>
                                    <li>Use the Peerify Player nearby</li>
                                    <li>No ads, governance rights, founding badge</li>
                                </ul>
                                <Link href="/signup/pilot" className={"roleCta"}>Become a founding member &rarr;</Link>
                            </div>
                        </div>

                        <div className={"roleCard"}>
                            <div className={"roleImageWrap"}>
                                <Image src="/peerify/hosts.jpg" alt="Hosts setting up a space for a concert" fill className={"roleImg"} sizes="(max-width: 768px) 100vw, 33vw" />
                            </div>
                            <div className={"roleBody"}>
                                <p className={"roleType"}>For Hosts &amp; Venues</p>
                                <h3>Open your space to living music</h3>
                                <ul>
                                    <li>Private events with guest vetting</li>
                                    <li>10% on tickets, invoiced after the event</li>
                                    <li>List on the map &amp; accept bookings</li>
                                    <li>No membership fee to get started</li>
                                </ul>
                                <Link href="/signup/pilot" className={"roleCta"}>List your space &rarr;</Link>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className={"howSection reveal"} id="how">
                <div className={"inner"}>
                    <p className={"sLabel"}>How it works</p>
                    <h2 className={"serif"}>Discover &rarr; Pledge &rarr; Host &rarr; Perform</h2>
                    <div className={"steps"}>
                        {STEPS.map((s) => (
                            <div key={s.n} className={"step"}>
                                <div className={"stepN"}>{s.n}</div>
                                <h4>{s.title}</h4>
                                <p>{s.body}</p>
                            </div>
                        ))}
                    </div>
                    <div className={"playerBlock"}>
                        <div className={"playerCircle"}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <polygon points="8,6 8,18 19,12" fill="none" stroke="#e8720c" strokeWidth="1.5" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <h4>The Peerify Player &mdash; music that travels with you</h4>
                            <p>A proximity-based player that lets you share music you own with anyone nearby who also has the Player open. No streaming required. All plays are recorded &mdash; Peerify&apos;s surplus returns to artists as royalties.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── PHOTO STRIP ── */}
            <div className={"photoStrip"}>
                <div className={"stripItem"}><Image src="/peerify/about.jpg"    alt="A room set up for music"              fill className={"strip-img"} sizes="33vw" /></div>
                <div className={"stripItem"}><Image src="/peerify/artist.jpg"   alt="Artist performing at a house concert" fill className={"strip-img"} sizes="33vw" /></div>
                <div className={"stripItem"}><Image src="/peerify/involved.jpg" alt="Everyone together after a show"       fill className={"strip-img"} sizes="33vw" /></div>
            </div>

            {/* ── MANIFESTO ── */}
            <section className={"manifesto-section reveal"}>
                <blockquote>
                    &ldquo;An artist with <em>1,000 true fans</em> across the globe should be able
                    to make a living from their music.&rdquo;
                </blockquote>
                <p className={"manifesto-attr"}>&mdash; The Peerify thesis</p>
            </section>

            {/* ── TRUST ── */}
            <section className={"trust-section reveal"} id="about">
                <div className={"trustGrid"}>
                    <div className={"trust-item"}>
                        <strong>Non-profit</strong>
                        <span>Peerify is owned by Social Systems Foundation. All surplus returns to artists and the community.</span>
                    </div>
                    <div className={"trust-item"}>
                        <strong>Human music only</strong>
                        <span>This platform is for human artists, full stop. No AI-generated content, ever.</span>
                    </div>
                    <div className={"trust-item"}>
                        <strong>Open by design</strong>
                        <span>You own your audience. Your data is yours. No lock-in, no extractive terms, no algorithms obscuring your fans.</span>
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className={"cta-section reveal"} id="join">
                <div className={"cta-inner"}>
                    <h2>Keen to help build the Peerify prototype?</h2>
                    <p className={"cta-intro"}>
                        We are looking for 500 artists and fans to populate the map and test the features.
                        Join now and help shape what Peerify becomes.
                    </p>
                    <div className={"bigStats"}>
                        <div className={"bigStat"}>
                            <div className={"bigStatN"}>{STATS.artists.toLocaleString()}</div>
                            <div className={"bigStatL"}>Artists</div>
                        </div>
                        <div className={"bigStat"}>
                            <div className={"bigStatN"}>{STATS.members.toLocaleString()}</div>
                            <div className={"bigStatL"}>Members</div>
                        </div>
                        <div className={"bigStat"}>
                            <div className={"bigStatN"}>{STATS.venues.toLocaleString()}</div>
                            <div className={"bigStatL"}>Venues</div>
                        </div>
                    </div>
                    <div className={"ctaGroup"}>
                        <Link href="/signup/pilot" className={"btnDark"}>Join as a fan / member</Link>
                        <Link href="/signup/pilot" className={"btnDark"}>Create an artist profile</Link>
                        <Link href="/signup/pilot" className={"btnOutlineDark"}>List a venue or space</Link>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className={"footer"}>
                <div className={"footerLogo"}>
                    <Image src="/peerify/logo-mark.png" alt="Peerify mark" width={28} height={28} />
                    <div className={"footerLogoText"}>Peer<span>ify</span></div>
                </div>
                <nav className={"footerLinks"}>
                    <Link href="/about">About</Link>
                    <Link href="/signup/pilot">For artists</Link>
                    <Link href="/explore">Explore map</Link>
                    <a href="https://peerify.net" target="_blank" rel="noopener noreferrer">peerify.net</a>
                </nav>
                <p className={"footerNote"}>
                    A non-profit project by Social Systems Foundation.<br />
                    &copy; {new Date().getFullYear()} Peerify
                </p>
            </footer>

        </div>
    )
}
