// main app home aggregate feed
import LandingPage from "@/components/layout/landing-page";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ExternalLink, Play, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default async function Welcome() {
    return (
        <main className="flex min-h-screen flex-col items-center">
            {/* Hero Section with Background Image */}
            <section className="relative w-full px-4 py-24 text-center md:py-32">
                {/* Background Image */}
                <div className="absolute inset-0 z-0">
                    <Image
                        src="/images/world-map-dots.png"
                        alt="World Map Dots"
                        fill
                        className="object-cover opacity-60"
                        priority
                    />
                </div>

                {/* Content */}
                <div className="relative z-10">
                    <h1 className="font-bebas mb-4 text-5xl text-[#175848] md:text-6xl lg:text-7xl">
                        MakeCircles - The Social Impact Network
                    </h1>
                    <p className="mb-8 inline-block rounded-md bg-white/60 px-4 py-1 text-xl">
                        No Ads, No Big Tech, Non-Profit and Open-Source
                    </p>

                    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <Link href="/explore">
                            <Button className="rounded bg-[#FAAE3C] px-8 py-6 text-white hover:bg-[#FAAE3C]/90">
                                Explore the platform
                            </Button>
                        </Link>
                        <Link href="https://makecircles.socialsystems.io/">
                            <Button
                                variant="outline"
                                className="rounded border-[#2B463C] px-8 py-6 text-[#2B463C] hover:bg-[#2B463C] hover:text-white"
                            >
                                Test Pilot Sign-up
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Why Make Circles - Thinner like a footer */}
            <section className="w-full bg-[#2B463C] px-4 py-4 text-white md:px-8">
                <div className="mx-auto flex max-w-4xl items-center justify-between">
                    <h2 className="font-bebas mb-0 mt-0 pb-0 pt-0 text-lg">Why Make Circles?</h2>
                    <a
                        href="https://www.socialsystems.io/wp-content/uploads/2025/03/MakeCircles.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#FAAE3C] hover:underline"
                    >
                        read more
                    </a>
                </div>
            </section>

            {/* Social Media Problems */}
            <section className="w-full px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">
                        Social Media is not designed to improve your life or the world
                    </h2>
                    <p className="mb-8 text-lg">
                        After over two decades it is clear that the cost of our dominant privately owned social networks
                        far outweigh their benefits. We seem to have more relationships but they are also more tenuous
                        and fragile. We have plentiful access to tailor-made entertainment, but it is tailored to seize
                        and hold our attention, not to nourish our spirits or sharpen our minds. Distraction has
                        replaced depth resulting in less real social engagement, worse mental and physical health,
                        increasing societal conflict and ever decreasing personal agency. Our every move online is
                        monitored and algorithmically optimized to propel us in whatever direction will generate the
                        platform more profit, irrespectively of if it is to our detriment or not.
                    </p>

                    <div className="my-12 text-center">
                        <h3 className="mb-4 font-sans text-2xl italic md:text-3xl">
                            In one sentence, social media platforms were never designed for us, they were designed
                            against us
                        </h3>
                    </div>
                    <p className="mb-8 text-lg">But it doesn&apos;t have to be this way.</p>
                </div>
            </section>

            {/* Building MakeCircles - With different background color */}
            <section className="w-full bg-[#FEF9E8] px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">
                        That&apos;s Why We Are Building MakeCircles
                    </h2>
                    <p className="mb-8 text-lg">
                        MakeCircles is designed for the Changemakers of the world, because you are needed now more than
                        ever. We want to give you the tools, resources, connections and agency to accomplish your goals.
                        A platform that allows you to do your work in an open, transparent and collaborative way. No
                        advertising, spying, manipulation or selling of user data. Quite to the contrary, our goal is
                        that you own and control all your data and all your relationships and, ultimately, all your
                        funding streams.
                    </p>
                </div>
            </section>

            {/* What can MakeCircles Do */}
            <section className="w-full px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">What can MakeCircles Do?</h2>
                    <p className="mb-8 text-lg">
                        MakeCircles is currently in our <strong>beta testing phase</strong>. This means we are not ready
                        for public use as we need to test the platform for bugs and also have a number of new features
                        and improvements to do. That said, we already have all the{" "}
                        <strong>basic social functionality</strong> in place and then some.
                    </p>
                    <p className="mb-8 text-lg">
                        For instance, we have an <strong>integrated geographical interface</strong>, that allows you to
                        create and pin circles to a map, or use it to{" "}
                        <strong>find projects, events, people and opportunities</strong> both locally and globally. It
                        is also possible to write and <strong>vote on proposals</strong> or create and{" "}
                        <strong>allocate tasks</strong> to users to make more progress. We have a number of other
                        democratic governance functions we will add and test before we go public, as well as privacy
                        functions, video conferencing, crowd funding, resource sharing and more. We have also designed
                        MakeCircles to <strong>give our users control</strong> over themselves and their communities.
                        You decide who you share what information with and give what access to.
                    </p>
                    <div className="relative mt-16 flex items-center justify-center rounded-lg border border-gray-300 p-8">
                        <video
                            className="aspect-video w-full max-w-md rounded"
                            controls
                            poster="/images/video-thumbnail.jpg"
                        >
                            <source src="/videos/intro.mp4" type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                        <div className="absolute bottom-4 right-4 bg-[#FAAE3C] p-2 text-white">
                            <p className="text-xs">Tom</p>
                            <p className="text-xs">Talking</p>
                            <p className="text-xs">Sense</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How You can help */}
            <section className="w-full bg-[#FEF9E8] px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">How You can help</h2>
                    <p className="mb-8 text-lg">
                        There are a number of ways you can help. First, <strong>create a profile</strong>, explore the
                        platform, invite some friends. Then, create a project or a community circle and test the
                        features. Let us know about the issues you come across and if you have any ideas for new
                        features or better designs, create a proposal and we&apos;ll add it to the public vote.{" "}
                        <strong>MakeCircles is a co-creative platform</strong>. We are designing it to work for you, and
                        you are the best judge of what that means.
                    </p>
                    <p className="mb-8 text-lg">
                        If you are as inspired by this as we are, there are many other ways to help out too. Developers,
                        designers, marketers, community leaders, project owners, funders, we&apos;d love to have you on
                        the team. Please visit <strong>Social Systems Lab&apos;s</strong>{" "}
                        <Link href="https://www.socialsystems.io">webpage</Link> for more info.
                    </p>

                    <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
                        <Link href="https://makecircles.socialsystems.io/">
                            <Button className="rounded bg-[#2B463C] px-8 py-6 text-white hover:bg-[#175848]">
                                Test Pilot Sign-up
                            </Button>
                        </Link>
                        <Link href="https://www.socialsystems.io/participate/">
                            <Button
                                variant="outline"
                                className="rounded border-[#2B463C] px-8 py-6 text-[#2B463C] hover:bg-[#FEF9E8]"
                            >
                                Other ways to help
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Who do we think we are */}
            <section className="w-full px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">Who do we think we are?</h2>
                    <p className="mb-8 text-lg">
                        We are a small team with big visions running a not-for profit, oligarch-free platform designed
                        to outcompete the best of its for-profit competitors. The project custodian is The Social
                        Systems Foundation that is committed to open-source technology to serve humanity and the planet.
                        You can read more about us on Social Systems Lab&apos;s webpage, and if you share our vision and
                        are interested in joining our motley crew of Changemakers, we&apos;d most definitely welcome the
                        conversation. Just send us a message!
                    </p>
                    <div className="mt-8 flex justify-center">
                        <Link href="https://www.socialsystems.io/our_people/">
                            <Button
                                variant="outline"
                                className="rounded border-[#2B463C] px-8 py-6 text-[#2B463C] hover:border-[#FAAE3C] hover:bg-[#FAAE3C] hover:text-white"
                            >
                                About us
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Tell Me More */}
            <section className="w-full bg-[#FEF9E8] px-4 py-16 md:px-8">
                <div className="mx-auto max-w-4xl">
                    <h2 className="font-bebas mb-6 text-4xl text-[#175848] md:text-5xl">Tell Me More...</h2>
                    <p className="mb-8 text-lg">Still wondering why you should join MakeCircles as a test pilot?</p>

                    <div className="formatted space-y-4">
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="item-1" className="mb-4 rounded-md border border-gray-300">
                                <AccordionTrigger className="flex items-center px-4 py-3  pb-0">
                                    <div className="flex items-center">
                                        <Plus size={16} className="mr-2 text-[#FAAE3C]" />
                                        <span>Why should I use my valuable time to improve your product?</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-3">
                                    Well, it&apos;s not exactly our product in the sense that we, not you, own it and
                                    that we, not you, will profit from it. Rather it is our product in the sense that it
                                    is both yours and ours and is designed to benefit all of us. Yes, legally the
                                    platform is owned by Social Systems Lab, which in turn is completely owned by the
                                    Foundation, but it is designed to benefit you as a user. You get to help turn it
                                    into something truly useful that you control by voting on the features you most want
                                    to see. And if it creates a surplus, these funds will be returned back into the
                                    ecosystem through your &apos;Altruistic Wallet&apos;, which you can then allocate to
                                    projects you wish to support. In addition, the platform is also completely
                                    open-source, and you are more than welcome to set up your own circle server and
                                    develop it on your own in whatever direction you choose, should you not be happy
                                    with the direction things go.
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="item-2" className="mb-4 rounded-md border border-gray-300">
                                <AccordionTrigger className="flex items-center px-4 py-3  pb-0">
                                    <div className="flex items-center">
                                        <Plus size={16} className="mr-2 text-[#FAAE3C]" />
                                        <span>Who is behind MakeCircles?</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-3">
                                    MakeCircles is built and maintained by the team at Social Systems Lab, which is a
                                    subsidiary of the not-for-profit Social Systems Foundation. You can read more about
                                    us <Link href="https://www.socialsystems.io/">here</Link>.
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="item-3" className="mb-4 rounded-md border border-gray-300">
                                <AccordionTrigger className="flex items-center px-4 py-3  pb-0">
                                    <div className="flex items-center">
                                        <Plus size={16} className="mr-2 text-[#FAAE3C]" />
                                        <span>How is MakeCircles funded?</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-3">
                                    MakeCircles is currently funded by the Foundation and by individual donations. The
                                    long-term goal is that MakeCircles will fund itself through voluntary paid
                                    memberships and brokerage fees, as donations are not necessarily a viable business
                                    model in the longer term. Members will not receive more services than non-members,
                                    but they will given a vote in all decisions about the platform and will also get to
                                    decide where their share of any profits are allocated.
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="item-4" className="mb-4 rounded-md border border-gray-300">
                                <AccordionTrigger className="flex items-center px-4 py-3 pb-0">
                                    <div className="flex items-center">
                                        <Plus size={16} className="mr-2 text-[#FAAE3C]" />
                                        <span>
                                            Will anything I contribute here have any influence on the real world?
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-3">
                                    MakeCircles is designed to have a direct impact on the real world. This can be
                                    achieved in numerous ways, such as through crowdfunding, volunteering or asset
                                    sharing. Of course, this will only become significant if a lot of people use
                                    MakeCircles for this purpose, but even before that, you can use the platform to
                                    create personal goals, projects and task and organize your personal life, which is
                                    very much part of the real world.
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="item-5" className="mb-4 rounded-md border border-gray-300">
                                <AccordionTrigger className="flex items-center px-4 py-3  pb-0">
                                    <div className="flex items-center">
                                        <Plus size={16} className="mr-2 text-[#FAAE3C]" />
                                        <span>
                                            How do I know I&apos;m not helping to create a platform that will eventually
                                            sell out for profit?
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-3">
                                    A legitimate concern. That does seem to be the way these things go in this day and
                                    age, so saying &quot;Just trust us&quot; won&apos;t really make much difference. But
                                    we are fully owned by a non-profit foundation, we are completely open-source and we
                                    are actively building tools that will connect our users in a peer-to-peer manner,
                                    which means we won&apos;t be able to hold your data, your relationships or your
                                    funding hostage. Which in turn means we will have little to no value should someone
                                    want to make an offer for the platform and network. Instead, the profits we seek are
                                    thriving communities with sufficiently funded projects made possible by volunteers
                                    and making use of available local resources. Do we want to pay our coworkers a
                                    decent salary? Obviously we do, but nothing excessive as the purpose is to maximize
                                    the return to the communities that make MakeCircles possible. Our accounting will
                                    always be open, to make sure we live up to this promise.
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <section className="w-full bg-[#FEF9E8] px-4 py-8 md:px-8">
                <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-4">
                    <Link href="https://www.socialsystems.io/">
                        <Button variant="outline" className="border-none bg-[#FAAE3C] text-white hover:bg-[#FAAE3C]/90">
                            <ExternalLink size={16} className="mr-2" />
                            <span>Social Systems Lab</span>
                        </Button>
                    </Link>
                    <Link href="https://www.socialsystems.io/foundation/">
                        <Button variant="outline" className="border-none bg-[#FAAE3C] text-white hover:bg-[#FAAE3C]/90">
                            Foundation
                        </Button>
                    </Link>
                    <Link href="https://www.socialsystems.io/partners/">
                        <Button variant="outline" className="border-none bg-[#FAAE3C] text-white hover:bg-[#FAAE3C]/90">
                            Partners
                        </Button>
                    </Link>
                    <Link href="https://vibeapp.dev/">
                        <Button variant="outline" className="border-none bg-[#FAAE3C] text-white hover:bg-[#FAAE3C]/90">
                            Vibe
                        </Button>
                    </Link>
                    <Link href="https://www.socialsystems.io/participate/">
                        <Button variant="outline" className="border-none bg-[#2B463C] text-white hover:bg-[#175848]">
                            Participate
                        </Button>
                    </Link>
                </div>
            </section>
        </main>

        // <div className="flex flex-1 flex-row justify-center overflow-hidden">
        //     <div className="flex max-w-[1100px] flex-1 flex-col items-center justify-center md:mb-4 md:mt-16">
        //         {/* <div className="mb-4 mt-4 flex max-w-[1100px] flex-1 flex-col items-center justify-center md:mt-16"> */}
        //         <LandingPage />
        //     </div>
        // </div>
    );
}
