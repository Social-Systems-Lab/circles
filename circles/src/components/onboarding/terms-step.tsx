"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingStepProps } from "./onboarding";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { saveTermsAgreementAction } from "./actions";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RichText from "@/components/modules/feeds/RichText";

// Dummy markdown content for Terms of Service
const TERMS_OF_SERVICE_CONTENT = `
# TERMS OF SERVICE (TOS) SUMMARY

- **Platform Purpose**: MakeCircles is a platform designed for building communities, collaborating on projects, and fostering meaningful interactions.  
- **Acceptance**: By using MakeCircles, you agree to these Terms of Service.  
- **User Responsibilities**: You’re responsible for all content you post and must follow all applicable laws.  
- **Content Ownership**: You own your content but grant MakeCircles the right to display and distribute it.  
- **Privacy & Data**: We respect your privacy and handle your data according to our Privacy Policy.  
- **Liability**: MakeCircles is provided “as is” with no warranties. We aren’t liable for user-generated content or data loss.  
- **Termination**: We can suspend or terminate accounts that violate these Terms.  
- **Contact**: Questions? Reach us at hello@socialsystems.io.
# 
---

# TERMS OF SERVICE
**Last Updated: [March 31, 2025]**

## 1. Introduction
Welcome to MakeCircles! MakeCircles is a platform designed for building communities, collaborating on projects, and fostering meaningful interactions. It allows you to create and manage Circles—private or public spaces where people can connect, share knowledge, and work together. The platform is still in development, and your participation helps us refine and improve it before the full launch.

By accessing or using MakeCircles (the “Platform”), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service (“Terms”). If you do not agree to these Terms in their entirety, please do not use MakeCircles.

## 2. Acceptance of Terms
By creating an account or otherwise using MakeCircles, you affirm that you are at least the age of majority in your place of residence. If you are using MakeCircles on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.

## 3. Description of Services
- **Community Building**: You can create or join Circles—public or private communities for discussion and collaboration.  
- **Project Collaboration**: MakeCircles may provide tools for project management, shared documents, and other collaborative features.  
- **Innovation & Development**: As an evolving platform, new features may be added, modified, or removed at our discretion.

## 4. User Accounts
- **Registration**: To fully utilize MakeCircles, you must create a user account. You agree to provide accurate and current information.  
- **Account Security**: You are responsible for safeguarding your account credentials and for any activities under your account. If you suspect unauthorized use, notify us immediately at hello@socialsystems.io.  
- **Account Termination**: We reserve the right to suspend or terminate any account that violates these Terms or for any other reason at our discretion.

## 5. Ownership of Content
- **User-Generated Content**: You retain full ownership of all content (text, images, videos, etc.) that you upload or post (“User Content”).  
- **License to MakeCircles**: By posting User Content on the Platform, you grant MakeCircles a non-exclusive, royalty-free, worldwide license to host, display, and distribute your content solely for providing our services.  
- **Content Removal**: If you delete User Content or close your account, we will make reasonable efforts to remove it from the Platform. However, copies or references may remain in cached or archived pages, or if other users have made references to your content.

## 6. User Conduct
You agree that you will not:  
- Use the Platform for any unlawful or unauthorized purpose.  
- Post content that is hateful, defamatory, obscene, or otherwise objectionable.  
- Interfere with or disrupt the security or performance of MakeCircles.  
- Use any automated system to scrape data or content from the Platform without our express written permission.

We reserve the right to remove content or restrict user accounts at our sole discretion for conduct we deem harmful.

## 7. Content Exposure
MakeCircles hosts a variety of content from diverse users. While we strive to maintain a respectful environment, you may encounter content you find offensive or objectionable. Such content is the responsibility of the user who posted it, and MakeCircles disclaims liability for user-generated content.

## 8. Availability of Service
MakeCircles is provided “as is” and “as available.” We do not guarantee uninterrupted or error-free operation. We may suspend or discontinue any feature or service, in whole or in part, at any time, without notice or liability.

## 9. Loss of Data
MakeCircles is not responsible for the loss of any data. We encourage you to maintain your own backups of important content or data.

## 10. Disclaimer of Warranties
To the fullest extent permitted by law, MakeCircles disclaims all warranties, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, non-infringement, and correctness of content.

## 11. Limitation of Liability
Under no circumstances shall MakeCircles or its affiliates be liable for any indirect, incidental, special, consequential, or exemplary damages arising from or relating to your use of the Platform. Some jurisdictions do not allow the exclusion of certain warranties or the limitation or exclusion of liability for incidental or consequential damages. In such jurisdictions, our liability is limited to the greatest extent permitted by law.

## 12. Indemnification
You agree to indemnify and hold harmless MakeCircles, its founders, partners, and affiliates from any claims, losses, damages, or legal fees arising out of your use of the Platform, your User Content, or any breach of these Terms.

## 13. Changes to Terms
We may revise these Terms from time to time. If we make material changes, we will notify you via email or through a prominent notice on the Platform. Your continued use of MakeCircles after any revisions indicates your acceptance of the updated Terms.

## 14. Governing Law and Dispute Resolution
These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction]. Any dispute arising out of or relating to these Terms or your use of the Platform shall be resolved in the courts located in [Your Jurisdiction], unless otherwise required by applicable law.

## 15. Contact Us
If you have any questions, concerns, or comments about our Terms of Service, please reach out to us at:  
**Email**: hello@socialsystems.io

Thank you for using MakeCircles!
`;

// Dummy markdown content for Privacy Policy
const PRIVACY_POLICY_CONTENT = `
# PRIVACY POLICY
**Last Updated: [March 31, 2025]**

MakeCircles (“we,” “us,” or “our”) respects your privacy and is committed to protecting the personal information you share with us. This Privacy Policy outlines what information we collect, how we use it, and the choices you have regarding your information.

## 1. Information We Collect
1. **Account Information**: When you register, we may collect your name, email address, location, and any other information you voluntarily provide.  
2. **User-Generated Content**: Content you create, upload, or share, including text, images, or videos.  
3. **Usage Data**: We may automatically collect information about how you interact with the Platform, such as IP address, browser type, device information, and pages visited.  
4. **Cookies & Similar Technologies**: We use cookies and similar technologies to enhance your experience, remember your preferences, and gather usage data.

## 2. How We Use Your Information
- **To Provide and Improve Services**: We use your information to operate, maintain, and enhance the features and functionality of MakeCircles.  
- **Communication**: We may send you Platform-related updates, respond to your inquiries, or notify you of changes to our policies.  
- **Analytics**: Usage data helps us understand user behavior, improve user experience, and develop new features.  
- **AI & Recommendations**: We may use AI technologies (e.g., OpenAI embeddings) from your information to create semantic networks for user matchmaking, project recommendations, and other features.  
- **Legal Compliance**: We may use your information to comply with applicable laws, regulations, or legal requests.

## 3. Sharing and Disclosure of Information
- **Within MakeCircles**: Our team may access your information only as necessary to provide and improve our services.  
- **Third-Party Service Providers**: We may share your information with trusted vendors who help us operate our Platform (e.g., hosting, analytics). These providers are obligated to protect your information and may not use it for other purposes.  
- **Legal Requirements**: We may disclose your information if required to do so by law or when we believe disclosure is necessary to protect our rights or comply with a judicial proceeding, court order, or legal process.

## 4. Data Retention
We retain your personal information for as long as needed to provide our services or as otherwise required by law. User-Generated Content may be retained in backups or archives even after you delete it from public view.

## 5. Your Rights and Choices
- **Access and Correction**: You may request access to or correction of the personal information we hold about you.  
- **Deletion**: You may request that we delete your personal information, though we may retain certain data for legal or legitimate business purposes.  
- **Cookies**: You can usually modify your browser settings to decline cookies, but some Platform features may not function properly if you do so.  
- **Opt-Out**: You can opt-out of non-essential communications from us by following the unsubscribe instructions or contacting us directly.

## 6. Security Measures
We use reasonable safeguards to protect your information from unauthorized access or disclosure. However, no method of transmission over the internet or electronic storage is 100% secure. We encourage you to take steps to protect your personal information, such as using strong passwords.

## 7. International Data Transfers
If you access MakeCircles from outside of [Your Primary Jurisdiction], your data may be transferred across international borders. By using the Platform, you consent to the processing and transfer of your information in and to [Your Primary Jurisdiction] and other countries, subject to this Privacy Policy.

## 8. Children’s Privacy
MakeCircles is not directed at individuals under the age of 13 (or the age of majority in your jurisdiction). If we learn that we have collected personal information from a child under these ages, we will take steps to delete such information as soon as possible.

## 9. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. If we make material changes, we will notify you via email or through a prominent notice on the Platform. Your continued use of MakeCircles after any such changes indicates your acceptance of the updated policy.

## 10. Contact Us
For questions or concerns about this Privacy Policy or how we handle your personal information, please contact us at:  
**Email**: hello@socialsystems.io
`;

function TermsStep({ nextStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [agreedToTos, setAgreedToTos] = useState(false);
    const [agreedToEmailUpdates, setAgreedToEmailUpdates] = useState(false);
    const [activeTab, setActiveTab] = useState("terms");

    const handleNext = async () => {
        if (!user?._id) {
            nextStep();
            return;
        }

        setIsSubmitting(true);
        try {
            // Save terms agreement
            const response = await saveTermsAgreementAction(agreedToTos, agreedToEmailUpdates, user._id);

            if (response.success) {
                // Update local user state
                const updatedSteps = [...(user.completedOnboardingSteps || [])];
                if (!updatedSteps.includes("terms")) {
                    updatedSteps.push("terms");
                }

                setUser({
                    ...user,
                    completedOnboardingSteps: updatedSteps,
                    agreedToTos,
                    agreedToEmailUpdates,
                });

                nextStep();
            } else {
                console.error("Error saving terms agreement:", response.message);
                // Continue anyway
                nextStep();
            }
        } catch (error) {
            console.error("Error saving terms agreement:", error);
            nextStep(); // Continue anyway
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col space-y-2">
            <Tabs defaultValue="terms" className="w-full" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="terms">Terms of Service</TabsTrigger>
                    <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
                </TabsList>
                <TabsContent
                    value="terms"
                    className="formatted max-h-[300px] overflow-y-auto rounded-md border bg-white p-4"
                >
                    <RichText content={TERMS_OF_SERVICE_CONTENT} />
                </TabsContent>
                <TabsContent
                    value="privacy"
                    className="formatted max-h-[300px] overflow-y-auto rounded-md border bg-white p-4"
                >
                    <RichText content={PRIVACY_POLICY_CONTENT} />
                </TabsContent>
            </Tabs>

            <div className="flex flex-col space-y-4 pt-4">
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="terms"
                        checked={agreedToTos}
                        onCheckedChange={(checked) => setAgreedToTos(checked as boolean)}
                    />
                    <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        I agree to the Terms of Service and Privacy Policy
                    </label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="email"
                        checked={agreedToEmailUpdates}
                        onCheckedChange={(checked) => setAgreedToEmailUpdates(checked as boolean)}
                    />
                    <label
                        htmlFor="email"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        I agree to receive email updates about MakeCircles (optional)
                    </label>
                </div>
            </div>

            <div className="flex justify-between">
                <div />
                <Button onClick={handleNext} disabled={!agreedToTos || isSubmitting}>
                    Continue
                </Button>
            </div>
        </div>
    );
}

export default TermsStep;
