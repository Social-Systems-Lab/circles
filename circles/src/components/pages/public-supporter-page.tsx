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
        <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
    );
}

const principles = [
    "Environmental responsibility and regeneration",
    "Fair labour practices and worker dignity",
    "Community wellbeing and resilience",
    "Transparency and accountability",
    "Long-term value creation over short-term extraction",
];

export default function PublicSupporterPage() {
    return (
        <div className={`${montserrat.variable} ${notoSerif.variable} kam-supporter`}>
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
                            <Image className="emblem" src="/images/landing/kamooni-emblem-yellow.png" alt="Kamooni" width={140} height={140} priority />
                        </div>
                        <span className="eyebrow">— A long-term partnership</span>
                        <h1>
                            Ecosystem <em>Supporters.</em>
                        </h1>
                        <p className="lede">Not sponsorship. Long-term ecosystem custodianship, for organisations, businesses, and aligned individuals who help build and care for the commons.</p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— What you&apos;re supporting</span>
                        <h2>
                            Digital public <em>infrastructure.</em>
                        </h2>
                        <p>Kamooni is building digital public infrastructure for trust, coordination, and community action. Your support funds a stable, ad-free, non-extractive platform and ongoing maintenance, stewardship, and the professional development capacity needed to keep it healthy.</p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— Why this exists</span>
                        <h2>
                            Better systems, <em>together.</em>
                        </h2>
                        <p>Kamooni exists to offer an alternative layer. A place where trust is earned through contribution rather than visibility, where ethical producers and conscious consumers can find one another, and where the environment is designed for cooperation rather than competition.</p>
                    </div>
                </section>

                <section className="give-receive">
                    <div className="container">
                        <h2>
                            What you give. <em>What you receive.</em>
                        </h2>
                        <div className="grid">
                            <div className="panel">
                                <h3>What you give</h3>
                                <ul>
                                    <li>
                                        <strong>€500 per month</strong>, ongoing financial support
                                    </li>
                                    <li>Alignment with Kamooni&apos;s principles</li>
                                    <li>Willingness to participate as a responsible actor in a shared ecosystem</li>
                                </ul>
                            </div>
                            <div className="panel">
                                <h3>What you receive</h3>
                                <ul>
                                    <li>A stable, long-term relationship with a values-aligned platform</li>
                                    <li>
                                        A dedicated <strong>Ecosystem Supporter Circle</strong> on Kamooni
                                    </li>
                                    <li>The ability to present who you are, what you stand for, and how you operate</li>
                                    <li>Opportunities to build real, lasting relationships with conscious consumers and community actors</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— Your Circle on Kamooni</span>
                        <h2>
                            Not a billboard. <em>A workshop with the door open.</em>
                        </h2>
                        <p>Each Ecosystem Supporter is invited to host their own Circle. Within it, you can introduce yourself and your organisation, describe your ethical and sustainable practices, share the projects and causes you actively support, publish updates and reflections, and list the goods or services you offer.</p>
                        <p>These Circles are not advertising space. They are spaces to share the parts of your work that are most meaningful. The work you&apos;re most proud of. If others resonate with your mission and what you offer, all the better.</p>
                        <p>
                            Community members are invited to support Ecosystem Supporters if they so choose, just as supporters help sustain the platform. <strong>A virtuous loop between contribution, trust, and impact.</strong>
                        </p>
                    </div>
                </section>

                <section className="doesnt-buy">
                    <div className="container">
                        <div className="callout">
                            <span className="eyebrow">— Important to be clear about</span>
                            <h2>
                                What support <em>doesn&apos;t buy.</em>
                            </h2>
                            <ul>
                                <li>Algorithmic boosting or preferential visibility</li>
                                <li>Advertising placements</li>
                                <li>Control over platform governance</li>
                                <li>Access to user data</li>
                                <li>Influence over community decision-making</li>
                            </ul>
                            <p className="closer">
                                Support does not buy power. <em>It supports capacity without capture.</em>
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— Who this is for</span>
                        <h2>
                            Genuine commitment, <em>not branding.</em>
                        </h2>
                        <p>Ecosystem Supporters are expected to demonstrate real, ongoing commitment to one or more of the following:</p>
                        <ul className="principles">
                            {principles.map((principle) => (
                                <li key={principle}>
                                    <span>—</span>
                                    {principle}
                                </li>
                            ))}
                        </ul>
                        <p>
                            Kamooni reserves the right to refuse or end partnerships that violate these principles. <strong>Alignment protects the ecosystem for everyone.</strong>
                        </p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— What we commit to in return</span>
                        <h2>
                            Transparency and <em>mutual accountability.</em>
                        </h2>
                        <p>Clear communication about how supporter funds are used. Openness about priorities, constraints, and trade-offs. Ongoing dialogue with Ecosystem Supporters.</p>
                        <p>As our governance and treasury tools mature, supporters will gain increasing visibility into resource flows, supported capabilities, and collective impact.</p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— Where this is going</span>
                        <h2>
                            The bigger <em>picture.</em>
                        </h2>
                        <p>Kamooni&apos;s long-term aim is to become a federated, member-governed digital commons. A trusted coordination layer for regenerative communities, and a bridge between ethical production, community action, and collective care.</p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— Where the money goes</span>
                        <h2>
                            Voting with our <em>wallets.</em>
                        </h2>
                        <p>Businesses are one of the pillars of society, and some of these pillars are more reliable than others. Our long-term goal is to create partnerships between ethical businesses and conscious consumers.</p>
                        <p className="emphasis">
                            In the end, our most powerful vote is with our wallets, <em>and we want to help direct these funds to the businesses that include community in the bottom line.</em>
                        </p>
                    </div>
                </section>

                <section className="section">
                    <div className="container">
                        <span className="eyebrow">— An invitation</span>
                        <h2>
                            Be the <em>first ten.</em>
                        </h2>
                        <p>Right now, we&apos;re looking for the first ten Ecosystem Supporters. Their backing funds a 6-month pilot. That&apos;s the runway to launch the platform properly. After that, we&apos;ll grow toward 100.</p>
                        <p>
                            The early ten don&apos;t just support what exists. <strong>They help shape what comes next.</strong>
                        </p>
                    </div>
                </section>

                <section className="pullquote">
                    <p>
                        &quot;We support Kamooni because better systems don&apos;t appear by themselves. <em>They are built and cared for together.</em>&quot;
                    </p>
                    <p className="attrib">— A simple way to say it</p>
                </section>

                <section className="final-cta">
                    <div className="inner">
                        <span className="eyebrow">— If this resonates</span>
                        <h2>
                            Let&apos;s <em>talk.</em>
                        </h2>
                        <p>Ecosystem Support is values-led and relationship-based. It&apos;s for organisations and individuals who understand that markets alone don&apos;t create healthy societies, that infrastructure shapes behaviour, and that supporting the commons is part of ethical participation.</p>
                        <a className="btn-primary" href="mailto:hello@socialsystems.io?subject=Kamooni%20Ecosystem%20Supporter">
                            Get in touch
                            <ArrowIcon />
                        </a>
                        <p className="back-link">
                            <Link href="/donations">← Back to support overview</Link>
                        </p>
                    </div>
                </section>

                <footer>
                    <div className="container">
                        <div className="row">
                            <span>Kamooni — The Social Impact Network. Open-source, member-shaped.</span>
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
