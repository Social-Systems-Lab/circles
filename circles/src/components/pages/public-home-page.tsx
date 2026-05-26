import Link from "next/link";
import Image from "next/image";
import { Montserrat, Noto_Serif, Outfit } from "next/font/google";
import PublicHomePageEffects from "./public-home-page-effects";

const montserrat = Montserrat({
    subsets: ["latin"],
    variable: "--font-montserrat",
});

const notoSerif = Noto_Serif({
    subsets: ["latin"],
    variable: "--font-noto-serif",
});

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
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

function ArrowIcon({ width = 18, height = 18 }: { width?: number; height?: number }) {
    return (
        <svg className="arrow" width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
    );
}

function HeartIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7-4.5-9.5-9C1 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6 4 4.5 8C19 16.5 12 21 12 21z" />
        </svg>
    );
}

function PinIcon() {
    return (
        <svg viewBox="0 0 14 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 1.5C4.24 1.5 2 3.74 2 6.5c0 4 5 11 5 11s5-7 5-11c0-2.76-2.24-5-5-5z" />
        </svg>
    );
}

const uspItems = [
    {
        num: "01",
        label: "The Impact Atlas",
        title: (
            <>
                A living map of <em>people, projects and the change they make.</em>
            </>
        ),
        body: "Finding causes to engage with in a practical way could be a lot easier. We offer a map. Literally. Search by cause, place, or skill. Browse what's happening locally or across the globe, in person or online. Add your own pin to the Impact Atlas and let aligned people find you, too.",
    },
    {
        num: "02",
        label: "Volunteer & contribute",
        title: (
            <>
                Offer a skill, lend an hour, <em>make someone&apos;s day.</em>
            </>
        ),
        body: "Add your skills and interests to your profile and match with projects and people who need exactly what you bring. Take on a single task that helps someone out or join a team with a shared goal. Or start your own project and find the right people to help you make it happen. It's a bit like a dating site for changemakers.",
    },
    {
        num: "03",
        label: "Funds that matter",
        title: (
            <>
                Small change. <em>Big difference.</em>
            </>
        ),
        body: "Only have a little cash to spare? For many people, even a tiny donation can go a long way. Kamooni has a micro-crowdfunding option where people can ask for the small but crucial things. For bigger projects, being able to ask for volunteers and resources can also reduce one's budget considerably.",
    },
    {
        num: "04",
        label: "Human Oriented Communication",
        title: (
            <>
                Less noise. <em>More signal.</em>
            </>
        ),
        body: "We need to take back control over human communication. Move away from the overload by channelling the right information through useful channels so it reaches those who need it. We've put a lot of effort into minimising distractions and making it easy to find who and what you need.",
    },
];

const qaItems = [
    {
        question: "— Who is Kamooni for?",
        answer: (
            <>
                Tools for <em>transformation.</em>
            </>
        ),
        body: (
            <>
                <p>A single task can change someone&apos;s afternoon. A few hours can change someone&apos;s week. A small donation, well placed, can change someone&apos;s year.</p>
                <p>Kamooni is designed for people who want to take action and work together on shared causes. If you want to drive change, Kamooni is for you.</p>
                <p className="emphasis">
                    Kamooni seeks to make it easier to do the thing you keep meaning to do, <em>and harder to forget that it mattered.</em>
                </p>
            </>
        ),
    },
    {
        question: "— No ads, no spying, no fees?",
        answer: (
            <>
                How can this <em>even work?</em>
            </>
        ),
        body: (
            <>
                <p>Well, mainly through you, and people like you. People who support Kamooni as a paying member or help in other ways. You keep Kamooni open for everyone else.</p>
                <p>However, since Kamooni is not owned by private investors, any surplus we create together can be returned to the community. Through the projects that you choose to support.</p>
                <p className="emphasis">
                    Our goal is not just to make ends meet, <em>it is to give back as much as possible.</em>
                </p>
            </>
        ),
    },
    {
        question: "— Ok, I might give it a try",
        answer: (
            <>
                How might I <em>contribute?</em>
            </>
        ),
        body: (
            <>
                <p>Glad you asked. Kamooni is very much in an early stage. We are still ironing out the kinks and testing new ideas. It&apos;s a very exciting time. The second half of this year will be dedicated to refining and improving the platform so we can launch with confidence and panache.</p>
                <p>
                    A great next step is to join our growing team of intrepid test pilots. If you are someone with solid ideas for a better social environment, this is your chance to make your mark! Want to meet the rest of the team first? Join us for one of our regular{" "}
                    <strong>
                        <Link href="/circles/changemaker-tuesdays/home">open sessions on Tuesdays</Link>
                    </strong>
                    .
                </p>
            </>
        ),
    },
];

const statTargets = [
    { label: "People", target: 145 },
    { label: "Circles", target: 97 },
];

export default function PublicHomePage() {
    return (
        <div className={`${montserrat.variable} ${notoSerif.variable} ${outfit.variable} kam-home`}>
            <PublicHomePageEffects />
            <section className="hero">
                <div className="hero-bg" aria-hidden="true" />

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

                <div className="hero-content">
                    <div className="container">
                        <div className="hero-brand">
                            <Image className="hero-emblem" src="/images/landing/kamooni-emblem-yellow.png" alt="" width={140} height={140} priority />
                            <Image className="hero-wordmark-img" src="/images/landing/kamooni-wordmark-yellow.png" alt="Kamooni" width={560} height={160} priority />
                            <p className="hero-tagline">The Social Impact Network</p>

                            <h2 className="hero-strikeline">
                                No <span className="strike">ads</span>. No <span className="strike">spying</span>. No <span className="strike">oligarchs</span>.
                            </h2>
                            <p className="hero-sub">
                                Non-profit <span className="sep">·</span> Open-source <span className="sep">·</span> Built for the common good
                            </p>

                            <div className="cta-row">
                                <Link className="btn btn-primary" href="/explore">
                                    Find the others
                                    <ArrowIcon />
                                </Link>
                                <Link className="btn btn-donate" href="/donate">
                                    <HeartIcon />
                                    Donate
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="usps" id="usps">
                <div className="container">
                    <div className="head">
                        <h2>
                            What <em>if?</em>
                        </h2>
                        <p>What if social media didn&apos;t suck? What would a platform look like if it were designed with the sole purpose of empowering people and the communities they live within? Here are a few of the things we came up with.</p>
                    </div>

                    <div className="usp-grid">
                        {uspItems.map((item) => (
                            <article key={item.num} className="usp reveal">
                                <div className="top">
                                    <span className="num">{item.num}</span>
                                    <span className="label">{item.label}</span>
                                </div>
                                <h3>{item.title}</h3>
                                <p>{item.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="qa-stack" id="qa">
                {qaItems.map((item, index) => (
                    <div key={item.question}>
                        {index > 0 ? (
                            <div className="pin-divider" aria-hidden="true">
                                <PinIcon />
                            </div>
                        ) : null}

                        <div className="qa reveal">
                            <span className="qa-question">{item.question}</span>
                            <h2 className="qa-answer">{item.answer}</h2>
                            {item.body}
                        </div>
                    </div>
                ))}
            </section>

            <section className="stats">
                <div className="container">
                    <p className="stats-title">Our current cohort</p>
                    <div className="stats-row">
                        {statTargets.map((stat, index) => (
                            <div key={stat.label} className="stat">
                                <span className="num" data-target={stat.target}>
                                    0
                                </span>
                                <span className="label">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="stats-cta">
                        <Link className="btn btn-primary" href="/signup/pilot">
                            Sign up
                            <ArrowIcon />
                        </Link>
                    </div>
                </div>
            </section>

            <section className="vital-statement reveal">
                <p className="line-1">It&apos;s not about going viral.</p>
                <p className="line-2">It&apos;s about going vital.</p>
                <p className="vital-credit">
                    Kamooni is a project by <a href="https://www.socialsystems.io/">Social Systems Lab</a>.
                </p>
            </section>

            <section className="final">
                <div className="container">
                    <div className="inner">
                        <p className="pre">Sound exciting?</p>
                        <h2>
                            Join the <em>community.</em>
                        </h2>
                        <p className="final-sub">Let&apos;s build something we can actually use.</p>
                        <div className="cta-row">
                            <Link className="btn btn-ghost" href="/explore">
                                Explore
                            </Link>
                            <Link className="btn btn-donate" href="/donations">
                                <HeartIcon />
                                Fund us
                            </Link>
                            <Link className="btn btn-primary" href="/signup/pilot">
                                Join
                                <ArrowIcon />
                            </Link>
                        </div>
                    </div>
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
        </div>
    );
}
