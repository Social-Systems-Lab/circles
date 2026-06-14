import Link from "next/link";
import Image from "next/image";
import { Montserrat, Noto_Serif } from "next/font/google";

const montserrat = Montserrat({
    subsets: ["latin"],
    variable: "--font-montserrat",
});

const notoSerif = Noto_Serif({
    subsets: ["latin"],
    variable: "--font-noto-serif",
});

function GlobeIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <ellipse cx="12" cy="12" rx="4" ry="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
    );
}

function ArrowIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
    );
}

function HeartIcon() {
    return (
        <svg className="heart" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7-4.5-9.5-9C1 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6 4 4.5 8C19 16.5 12 21 12 21z" />
        </svg>
    );
}

export default function PublicDonationsPage() {
    return (
        <div className={`${montserrat.variable} ${notoSerif.variable} kam-donations`}>
            <main>
                <nav className="top">
                    <div className="row">
                        <div className="menu menu-left">
                            <Link href="/explore" className="explore">
                                <GlobeIcon />
                                Explore
                            </Link>
                        </div>
                        <div className="menu menu-right">
                            <Link href="/login" className="login">
                                Log in
                            </Link>
                        </div>
                    </div>
                </nav>

                <section className="page-head">
                    <div className="inner">
                        <div className="emblem-wrap">
                            <Image className="emblem" src="/images/landing/kamooni-emblem-yellow.png" alt="Peerify" width={140} height={140} priority />
                        </div>
                        <h1>
                            Support <em>Peerify.</em>
                        </h1>
                        <p className="lede">
                            Peerify is run by the <strong>Social Systems Foundation</strong>. As a non-profit project, we depend on voluntary support from people who want a healthier music ecosystem. Every donation helps keep the platform open, human, and independent.
                        </p>
                    </div>
                </section>

                <section className="options">
                    <div className="container">
                        <h2 className="section-title">— Two ways to support on a regular basis</h2>

                        <div className="grid">
                            <div className="option">
                                <span className="num">One</span>
                                <h3>
                                    Become a <em>supporting member.</em>
                                </h3>
                                <p>Once you have created a profile on Peerify, you can choose to become a supporting member at the level that works for you. Recurring support is what keeps the platform stable and predictable.</p>
                                <p>You&apos;ll find the details under:</p>
                                <span className="path">
                                    <code>Settings → Account settings</code>
                                </span>
                            </div>

                            <div className="option">
                                <span className="num">Two</span>
                                <h3>
                                    Become an <em>ecosystem supporter.</em>
                                </h3>
                                <p>For individuals, organisations, and businesses who want to offer operational support to the platform.</p>
                                <p className="pledge">€500 per month.</p>
                                <p>Being an ecosystem supporter comes with a few meaningful perks, including a dedicated Circle on the platform.</p>
                                <div className="link">
                                    <Link href="/supporter">
                                        Read about ecosystem support
                                        <ArrowIcon />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="one-off">
                    <div className="inner">
                        <p>
                            And of course, we welcome <strong>one-off donations</strong> too.
                        </p>
                        <Link className="btn-donate" href="/donate">
                            <HeartIcon />
                            Make a donation
                            <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M13 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>
                </section>

                <section className="contact-strip">
                    <p>
                        Questions, or want to talk to a human? <a href="https://www.socialsystems.io/contact/">Reach out</a>.
                    </p>
                </section>

                <footer>
                    <div className="container">
                        <div className="row">
                            <span>Peerify — community-driven music discovery and support. Open-source, member-shaped.</span>
                            <div className="links">
                                <a href="https://www.socialsystems.io/">Social Systems Lab</a>
                                <a href="https://www.socialsystems.io/foundation/">Foundation</a>
                                <a href="https://www.socialsystems.io/contact/">Contact</a>
                            </div>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
}
