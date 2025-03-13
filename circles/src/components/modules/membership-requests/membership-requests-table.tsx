"use client";

import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest, Page, Question } from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { approveMembershipRequestAction, rejectMembershipRequestAction } from "./actions";
import { Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MembershipRequestsTableProps {
    circle: Circle;
    page: Page;
    requests: MembershipRequest[];
}

const QuestionnaireAnswers: React.FC<{ answers: Record<string, string>; questions: Question[] }> = ({
    answers,
    questions,
}) => (
    <div className="space-y-4">
        {questions.map((question, index) => (
            <div key={index} className="border-b pb-2">
                <p className="font-semibold">{question.question}</p>
                <p>{answers[`question_${index}`] || "No answer provided"}</p>
            </div>
        ))}
    </div>
);

const MembershipRequestsTable: React.FC<MembershipRequestsTableProps> = ({ circle, page, requests }) => {
    const { toast } = useToast();
    const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});
    const [openDialogs, setOpenDialogs] = useState<{ [key: string]: boolean }>({});

    const handleApprove = async (requestId: string) => {
        setLoadingStates((prev) => ({ ...prev, [requestId]: true }));
        const result = await approveMembershipRequestAction(requestId, circle, page);
        setLoadingStates((prev) => ({ ...prev, [requestId]: false }));
        setOpenDialogs((prev) => ({ ...prev, [requestId]: false }));

        if (result.success) {
            toast({
                title: "Request Approved",
                description: result.message,
            });
        } else {
            toast({
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    const handleReject = async (requestId: string) => {
        setLoadingStates((prev) => ({ ...prev, [requestId]: true }));
        const result = await rejectMembershipRequestAction(requestId, circle, page);
        setLoadingStates((prev) => ({ ...prev, [requestId]: false }));
        setOpenDialogs((prev) => ({ ...prev, [requestId]: false }));

        if (result.success) {
            toast({
                title: "Request Rejected",
                description: result.message,
            });
        } else {
            toast({
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center">
                            No pending requests
                        </TableCell>
                    </TableRow>
                )}

                {requests.map((request) => (
                    <TableRow key={request._id}>
                        <TableCell>{request.name}</TableCell>
                        <TableCell>{request.email}</TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                            <div className="flex flex-row gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => handleApprove(request._id!)}
                                    disabled={loadingStates[request._id!]}
                                >
                                    {loadingStates[request._id!] ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        "Approve"
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleReject(request._id!)}
                                    disabled={loadingStates[request._id!]}
                                >
                                    {loadingStates[request._id!] ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        "Reject"
                                    )}
                                </Button>
                                {request.questionnaireAnswers && (
                                    <Dialog
                                        open={openDialogs[request._id!]}
                                        onOpenChange={(open) =>
                                            setOpenDialogs((prev) => ({ ...prev, [request._id!]: open }))
                                        }
                                    >
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Eye className="mr-2 h-4 w-4" /> View Details
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Follow Request Details</DialogTitle>
                                            </DialogHeader>
                                            <div className="py-4">
                                                <h3 className="font-semibold">Applicant Information</h3>
                                                <p>Name: {request.name}</p>
                                                <p>Email: {request.email}</p>
                                                <p>Requested At: {new Date(request.requestedAt).toLocaleString()}</p>
                                            </div>
                                            {request.questionnaireAnswers && (
                                                <div>
                                                    <h3 className="mb-2 font-semibold">Questionnaire Answers</h3>
                                                    <QuestionnaireAnswers
                                                        answers={request.questionnaireAnswers}
                                                        questions={circle.questionnaire || []}
                                                    />
                                                </div>
                                            )}
                                            <DialogFooter className="sm:justify-start">
                                                <Button
                                                    variant="default"
                                                    onClick={() => handleApprove(request._id!)}
                                                    disabled={loadingStates[request._id!]}
                                                >
                                                    {loadingStates[request._id!] ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        "Approve"
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => handleReject(request._id!)}
                                                    disabled={loadingStates[request._id!]}
                                                >
                                                    {loadingStates[request._id!] ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        "Reject"
                                                    )}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default MembershipRequestsTable;
