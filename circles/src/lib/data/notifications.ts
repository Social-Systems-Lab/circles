// src/lib/data/notifications.ts - Functions to send and group notifications
import {
    Circle,
    Comment,
    Post,
    NotificationType,
    Proposal,
    ProposalDisplay,
    ProposalStage,
    ProposalOutcome,
    UserPrivate,
    IssueDisplay, // Added IssueDisplay
    IssueStage, // Added IssueStage
} from "@/models/models";
import { sendNotifications } from "./matrix";
import { getUser, getUserPrivate } from "./user";
import { getFeed, getPost } from "./feed";
import { getCircleById, findProjectByShadowPostId, getCirclesByDids } from "./circle";
import { getMembers } from "./member";
import { getProposalById, getProposalReactions } from "./proposal"; // Use getProposalReactions
import { features } from "./constants";
import { getAuthorizedMembers } from "../auth/auth"; // Import the function to get authorized members

/**
 * Checks if a post is a shadow post for a project and returns the project if it is
 * @param post The post to check
 * @returns The project circle if the post is a shadow post, or null if not
 */
export async function getProjectForShadowPost(post: Post): Promise<Circle | null> {
    if (!post || !post._id) return null;

    // Fast check using the postType field
    if (post.postType !== "project") {
        return null;
    }

    try {
        console.log("🔍 [NOTIFY] Post is a project shadow post, fetching project:", {
            postId: post._id.toString(),
        });

        // Since we know it's a project post, find the associated project
        const projectCircle = await findProjectByShadowPostId(post._id.toString());

        console.log("🔔 [NOTIFY] getProjectForShadowPost results:", {
            postId: post._id.toString(),
            foundProject: projectCircle ? "Yes" : "No",
            projectId: projectCircle?._id,
            projectName: projectCircle?.name,
        });

        return projectCircle;
    } catch (error) {
        console.error("Error fetching project for shadow post:", error);
        return null;
    }
}

/**
 * Send a notification when someone comments on a user's post or project
 */
export async function notifyPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    console.log("🔔 [NOTIFY] notifyPostComment called:", {
        postId: post._id,
        commentId: comment._id,
        postAuthorDid: post.createdBy,
        commenterDid: comment.createdBy,
        commenterName: commenter?.name,
        postType: post.postType || "post",
    });

    try {
        await notifyRegularPostComment(post, comment, commenter);

        console.log("🔔 [NOTIFY] Notification sent successfully");
    } catch (error) {
        console.error("🔔 [NOTIFY] Error sending post comment notification:", error);
        // We don't re-throw the error because notification failures shouldn't break comment creation
    }
}

/**
 * Notifies the post author when someone comments on their post
 */
async function notifyRegularPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    // Don't notify if commenter is the post author
    if (post.createdBy === comment.createdBy) {
        console.log("🔔 [NOTIFY] Skipping notification - commenter is post author");
        return;
    }

    // Get post author with more detailed error handling
    console.log("🔔 [NOTIFY] Getting post author:", post.createdBy);
    const postAuthor = await getUser(post.createdBy);
    if (!postAuthor) {
        console.log("🔔 [NOTIFY] Post author not found, skipping notification");
        return;
    }

    const postAuthorPrivate = await getUserPrivate(postAuthor.did!);
    console.log("🔔 [NOTIFY] Post author found:", {
        name: postAuthor.name,
        did: postAuthor.did,
        notificationsRoomId: postAuthorPrivate.matrixNotificationsRoomId ? "exists" : "missing",
    });

    // Get post circle
    console.log("🔔 [NOTIFY] Getting feed:", post.feedId);
    let feed = await getFeed(post.feedId);
    if (!feed) {
        console.log("🔔 [NOTIFY] Feed not found, skipping notification");
        return;
    }

    console.log("🔔 [NOTIFY] Getting circle:", feed.circleId);
    let circle = await getCircleById(feed.circleId!);
    if (!circle) {
        console.log("🔔 [NOTIFY] Circle not found, using default values");
        circle = { name: "Unknown Circle" } as Circle;
    }

    // Send notification
    console.log("🔔 [NOTIFY] Sending post_comment notification to:", postAuthor.name);
    await sendNotifications("post_comment", [postAuthorPrivate], {
        circle,
        user: commenter,
        post,
        comment,
        postId: post._id?.toString(),
    });
}

/**
 * Send a notification when someone replies to a user's comment
 */
export async function notifyCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
): Promise<void> {
    // For regular comments, only notify the comment author
    await notifyRegularCommentReply(post, parentComment, reply, replier);
}

/**
 * Notifies just the comment author when someone replies to their comment
 */
async function notifyRegularCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
): Promise<void> {
    // Don't notify if replier is the comment author
    if (parentComment.createdBy === reply.createdBy) return;

    // Get parent comment author
    const commentAuthor = await getUser(parentComment.createdBy);
    if (!commentAuthor) {
        console.log("🔔 [NOTIFY] Comment author not found, skipping notification");
        return;
    }

    const commentAuthorPrivate = await getUserPrivate(commentAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    console.log("🔔 [NOTIFY] Sending comment_reply notification to:", commentAuthor.name);
    await sendNotifications("comment_reply", [commentAuthorPrivate], {
        circle,
        user: replier,
        post,
        comment: reply,
        postId: post._id?.toString(),
        commentId: parentComment._id?.toString(),
    });
}

/**
 * Send a notification when someone likes/reacts to a user's post
 */
export async function notifyPostLike(postId: string, reactor: Circle, reactionType: string = "like"): Promise<void> {
    // Get post
    const post = await getPost(postId);
    if (!post) return;

    // Don't notify if reactor is the post author
    if (post.createdBy === reactor.did) return;

    // Get post author
    const postAuthor = await getUser(post.createdBy);
    const postAuthorPrivate = await getUserPrivate(postAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("post_like", [postAuthorPrivate], {
        circle,
        user: reactor,
        post,
        reaction: reactionType,
        postId: post._id?.toString(),
    });
}

/**
 * Send a notification when someone likes/reacts to a user's comment
 */
export async function notifyCommentLike(
    comment: Comment,
    post: Post,
    reactor: Circle,
    reactionType: string = "like",
): Promise<void> {
    // Don't notify if reactor is the comment author
    if (comment.createdBy === reactor.did) return;

    // Get comment author
    const commentAuthor = await getUser(comment.createdBy);
    const commentAuthorPrivate = await getUserPrivate(commentAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("comment_like", [commentAuthorPrivate], {
        circle,
        user: reactor,
        post,
        comment,
        reaction: reactionType,
        postId: post._id?.toString(),
        commentId: comment._id?.toString(),
    });
}

/**
 * Send notifications when someone is mentioned in a post
 */
export async function notifyPostMentions(post: Post, author: Circle, mentionedCircles: Circle[]): Promise<void> {
    // Filter out self-mentions
    const mentionedUsers = mentionedCircles.filter((circle) => circle.did && circle.did !== author.did);

    if (mentionedUsers.length === 0) return;

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications("post_mention", mentionedUsers, {
        circle,
        user: author,
        post,
        postId: post._id?.toString(),
    });
}

/**
 * Send notifications when someone is mentioned in a comment
 */
export async function notifyCommentMentions(
    comment: Comment,
    post: Post,
    author: Circle,
    mentionedCircles: Circle[],
): Promise<void> {
    // Filter out self-mentions
    const mentionedUsers = mentionedCircles.filter((circle) => circle.did && circle.did !== author.did);

    if (mentionedUsers.length === 0) return;

    // Check if this is a shadow post for a project using the postType field
    const isProjectComment = post.postType === "project";
    // If it's a project post, get the project details
    const project = isProjectComment ? await findProjectByShadowPostId(post._id!.toString()) : null;

    console.log("🔔 [NOTIFY] Comment mention is for project:", isProjectComment ? "Yes" : "No");
    if (isProjectComment) {
        console.log("🔔 [NOTIFY] Project info:", {
            projectId: project?._id,
            projectName: project?.name,
        });
    }

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications("comment_mention", mentionedUsers, {
        circle,
        user: author,
        post,
        comment,
        postId: post._id?.toString(),
        commentId: comment._id?.toString(),
        project: isProjectComment ? project! : undefined,
        projectId: isProjectComment ? project?._id?.toString() : undefined,
    });
}

// --- Proposal Notifications ---

/**
 * Helper to get the circle for a proposal notification
 */
async function getProposalCircle(proposal: Proposal | ProposalDisplay): Promise<Circle | null> {
    if (!proposal?.circleId) {
        console.error("🔔 [NOTIFY] Proposal missing circleId");
        return null;
    }
    const circle = await getCircleById(proposal.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for proposal:", proposal.circleId);
    }
    return circle;
}

/**
 * Send notification when a proposal is submitted for review
 */
export async function notifyProposalSubmittedForReview(proposal: ProposalDisplay, submitter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalSubmittedForReview called:", {
            proposalId: proposal._id,
            submitterDid: submitter.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Find users with review permission (excluding the submitter)
        const reviewers = (await getAuthorizedMembers(circle, features.proposals.review)).filter(
            (user: Circle) => user.did !== submitter.did,
        );

        if (reviewers.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers found to notify for proposal:", proposal._id);
            return; // Exit if no reviewers
        }

        console.log(`🔔 [NOTIFY] Sending proposal_submitted_for_review to ${reviewers.length} reviewers`);
        await sendNotifications("proposal_submitted_for_review", reviewers, {
            circle,
            user: submitter, // The user who triggered the notification (submitter)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalSubmittedForReview:", error);
    }
}

/**
 * Send notification when a proposal is moved to the voting stage
 */
export async function notifyProposalMovedToVoting(proposal: ProposalDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalMovedToVoting called:", {
            proposalId: proposal._id,
            approverDid: approver.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Find users with voting permission (excluding the approver)
        const voters = (await getAuthorizedMembers(circle, features.proposals.vote)).filter(
            (user: Circle) => user.did !== approver.did,
        );

        if (voters.length === 0) {
            console.log("🔔 [NOTIFY] No voters found to notify for proposal:", proposal._id);
            return; // Exit if no voters
        }

        console.log(`🔔 [NOTIFY] Sending proposal_moved_to_voting to ${voters.length} voters`);
        await sendNotifications("proposal_moved_to_voting", voters, {
            circle,
            user: approver, // The user who triggered the notification (approver)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalMovedToVoting:", error);
    }
}

/**
 * Send notification to the author when their proposal is approved for voting
 */
export async function notifyProposalApprovedForVoting(proposal: ProposalDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalApprovedForVoting called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (proposal.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending proposal_approved_for_voting to author:", author.name);
        await sendNotifications("proposal_approved_for_voting", [author], {
            circle,
            user: approver, // The user who triggered the notification (approver)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalApprovedForVoting:", error);
    }
}

/**
 * Formats the resolution message for notifications.
 */
function formatProposalResolutionMessage(
    proposal: ProposalDisplay,
    outcomePrefix: string, // e.g., "Your proposal", "The proposal"
): string {
    const outcomeText = proposal.outcome === "accepted" ? "accepted" : "rejected";
    let message = `${outcomePrefix} "${proposal.name}" was ${outcomeText}`;
    if (proposal.resolvedAtStage) {
        message += ` during the ${proposal.resolvedAtStage} stage`;
    }
    if (proposal.outcomeReason) {
        message += `: ${proposal.outcomeReason}`;
    } else {
        message += ".";
    }
    return message;
}

/**
 * Send notification to the author when their proposal is resolved
 */
export async function notifyProposalResolvedAuthor(proposal: ProposalDisplay, resolver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalResolvedAuthor called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            resolverDid: resolver.did,
        });
        // Don't notify if resolver is the author
        if (proposal.createdBy === resolver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - resolver is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        const message = formatProposalResolutionMessage(proposal, "Your proposal");

        console.log("🔔 [NOTIFY] Sending proposal_resolved to author:", author.name);
        await sendNotifications("proposal_resolved", [author], {
            circle,
            user: resolver, // The user who triggered the notification (resolver)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
            proposalOutcome: proposal.outcome,
            proposalResolvedAtStage: proposal.resolvedAtStage,
            messageBody: message, // Send pre-formatted message
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalResolvedAuthor:", error);
    }
}

/**
 * Send notification to voters when a proposal is resolved
 */
export async function notifyProposalResolvedVoters(proposal: ProposalDisplay, resolver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalResolvedVoters called:", {
            proposalId: proposal._id,
            resolverDid: resolver.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Get users who voted (reacted) - excluding the resolver and the author
        const voters = (await getProposalReactions(proposal._id as string)).filter(
            (user: Circle) => user.did !== resolver.did && user.did !== proposal.createdBy,
        );

        if (voters.length === 0) {
            console.log("🔔 [NOTIFY] No voters found to notify for resolved proposal:", proposal._id);
            return; // Exit if no voters
        }

        const message = formatProposalResolutionMessage(proposal, "The proposal");

        console.log(`🔔 [NOTIFY] Sending proposal_resolved_voter to ${voters.length} voters`);
        await sendNotifications("proposal_resolved_voter", voters, {
            circle,
            user: resolver, // The user who triggered the notification (resolver)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
            proposalOutcome: proposal.outcome,
            proposalResolvedAtStage: proposal.resolvedAtStage,
            messageBody: message, // Send pre-formatted message
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalResolvedVoters:", error);
    }
}

/**
 * Send notification to the author when someone votes on their proposal
 */
export async function notifyProposalVote(proposal: ProposalDisplay, voter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalVote called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            voterDid: voter.did,
        });
        // Don't notify if voter is the author
        if (proposal.createdBy === voter.did) {
            console.log("🔔 [NOTIFY] Skipping notification - voter is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending proposal_vote to author:", author.name);
        await sendNotifications("proposal_vote", [author], {
            circle,
            user: voter, // The user who triggered the notification (voter)
            proposal, // Pass the full proposal object
            proposalId: proposal._id?.toString(),
            proposalName: proposal.name,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalVote:", error);
    }
}

// --- Issue Notifications ---

/**
 * Helper to get the circle for an issue notification
 */
async function getIssueCircle(issue: IssueDisplay): Promise<Circle | null> {
    if (!issue?.circleId) {
        console.error("🔔 [NOTIFY] Issue missing circleId");
        return null;
    }
    const circle = await getCircleById(issue.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for issue:", issue.circleId);
    }
    return circle;
}

/**
 * Send notification when an issue is submitted for review
 */
export async function notifyIssueSubmittedForReview(issue: IssueDisplay, submitter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueSubmittedForReview called:", {
            issueId: issue._id,
            submitterDid: submitter.did,
        });
        const circle = await getIssueCircle(issue);
        if (!circle) return;

        // Find users with review permission (excluding the submitter)
        const reviewers = (await getAuthorizedMembers(circle, features.issues?.review || "issues_review")).filter(
            (user: Circle) => user.did !== submitter.did,
        );

        if (reviewers.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers found to notify for issue:", issue._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending issue_submitted_for_review to ${reviewers.length} reviewers`);
        await sendNotifications("issue_submitted_for_review", reviewers, {
            circle,
            user: submitter, // The user who triggered the notification (submitter)
            // Pass issue details directly, not nested under 'issue'
            issueId: issue._id?.toString(),
            issueTitle: issue.title,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueSubmittedForReview:", error);
    }
}

/**
 * Send notification to the author when their issue is approved (moved to Open)
 */
export async function notifyIssueApproved(issue: IssueDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueApproved called:", {
            issueId: issue._id,
            authorDid: issue.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (issue.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(issue.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for issue:", issue._id);
            return;
        }

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending issue_approved to author:", author.name);
        await sendNotifications("issue_approved", [author], {
            circle,
            user: approver, // The user who triggered the notification (approver)
            // Pass issue details directly
            issueId: issue._id?.toString(),
            issueTitle: issue.title,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueApproved:", error);
    }
}

/**
 * Send notification when an issue is assigned to a user
 */
export async function notifyIssueAssigned(issue: IssueDisplay, assigner: Circle, assignee: UserPrivate): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueAssigned called:", {
            issueId: issue._id,
            assignerDid: assigner.did,
            assigneeDid: assignee.did,
        });
        // Don't notify if assigner is the assignee
        if (assigner.did === assignee.did) {
            console.log("🔔 [NOTIFY] Skipping notification - assigner is assignee");
            return;
        }

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending issue_assigned to assignee:", assignee.name);
        await sendNotifications("issue_assigned", [assignee], {
            circle,
            user: assigner, // The user who triggered the notification (assigner)
            // Pass issue details directly
            issueId: issue._id?.toString(),
            issueTitle: issue.title,
            assigneeName: assignee.name, // Add assignee name for context
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueAssigned:", error);
    }
}

/**
 * Send notification when an issue's status changes (e.g., Open -> In Progress, In Progress -> Resolved)
 */
export async function notifyIssueStatusChanged(
    issue: IssueDisplay,
    changer: Circle,
    oldStage: IssueStage,
): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueStatusChanged called:", {
            issueId: issue._id,
            changerDid: changer.did,
            oldStage: oldStage,
            newStage: issue.stage,
        });

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        const recipients: UserPrivate[] = [];
        const author = await getUserPrivate(issue.createdBy);
        let assignee: UserPrivate | null = null;
        if (issue.assignedTo) {
            assignee = await getUserPrivate(issue.assignedTo);
        }

        // Add author if not the changer
        if (author && author.did !== changer.did) {
            recipients.push(author);
        }

        // Add assignee if exists, not the changer, and not already added (i.e., not the author)
        if (assignee && assignee.did !== changer.did && assignee.did !== author?.did) {
            recipients.push(assignee);
        }

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients found for issue status change:", issue._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending issue_status_changed to ${recipients.length} recipients`);
        await sendNotifications("issue_status_changed", recipients, {
            circle,
            user: changer, // The user who triggered the notification (changer)
            // Pass issue details directly
            issueId: issue._id?.toString(),
            issueTitle: issue.title,
            issueOldStage: oldStage,
            issueNewStage: issue.stage,
        });
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueStatusChanged:", error);
    }
}
