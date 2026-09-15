import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAssessmentStatus } from '@/hooks/useAssessment';
import { SEO } from '@/components/seo/SEO';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STAGES = [
  "Analyzing resume",
  "Understanding job",
  "Investigating evidence",
  "Identifying skill gaps",
  "Preparing verification interview",
  "Verification interview",
  "Evaluating results",
  "Generating report"
];

const AssessmentProgress = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, isError, refetch } = useAssessmentStatus(id);

  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  useEffect(() => {
    if (!assessment) return;

    const status = assessment.status;
    const stage = assessment.agentState?._stage;
    const toolHistory = assessment.agentState?.agent?.toolCallHistory || [];
    const hasTool = (name: string) => toolHistory.some((t: any) => t.tool === name);

    // Derive current stage from backend state across all 8 stages
    let idx = 0;
    if (status === 'completed' || stage === 'COMPLETED') {
      idx = 8;
    } else if (stage === 'EVALUATE_AND_REPORT' || status === 'evaluating') {
      if (hasTool('generate_reports') || hasTool('batch_evaluation')) {
        idx = 7; // Generating report
      } else {
        idx = 6; // Evaluating results
      }
    } else if (stage === 'AWAITING_INTERVIEW' || status === 'awaiting_interview') {
      idx = 5; // Verification interview
    } else if (stage === 'PREPARE_INTERVIEW') {
      idx = 4; // Preparing verification interview
    } else if (stage === 'INVESTIGATE') {
      if (hasTool('identify_gaps') || hasTool('gap_analysis')) {
        idx = 3; // Identifying skill gaps
      } else {
        idx = 2; // Investigating evidence
      }
    } else if (stage === 'PREREQUISITES' || status === 'running' || status === 'initializing' || status === 'initialized') {
      if (hasTool('parse_job')) {
        idx = 2; // Job parsed, moving to evidence investigation
      } else if (hasTool('parse_resume') || assessment.agentState?.resume?.parsed || assessment.resumeId) {
        idx = 1; // Resume parsed, now understanding job
      } else {
        idx = 0; // Analyzing resume
      }
    }

    setCurrentStageIdx(idx);

    // Navigation triggers
    if (status === 'awaiting_interview' && assessment.interviewId) {
      // Redirect to the existing interview page with assessment context
      navigate(`/interview/${assessment.interviewId}?assessmentId=${id}`);
    } else if (status === 'completed') {
      // Redirect to result page
      navigate(`/assessment/${id}/result`);
    }

  }, [assessment, navigate, id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || assessment?.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-destructive">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="w-6 h-6" />
              <CardTitle>Assessment Failed</CardTitle>
            </div>
            <p className="text-muted-foreground text-sm">An error occurred while processing your assessment. Please try again.</p>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} variant="outline" className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center p-4 relative overflow-hidden">
      {/* Neural Agent HUD Background */}
      <div 
        className="fixed inset-0 pointer-events-none -z-10 bg-cover bg-center bg-no-repeat transition-opacity duration-700"
        style={{ backgroundImage: `url('/backgrounds/agent-network-hud.jpg')` }}
      />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-background/85 backdrop-blur-[2px]" />

      <SEO title="Assessment Progress" />
      <Card className="w-full max-w-lg shadow-2xl border-border/70 bg-card/90 backdrop-blur-xl">
        <CardHeader className="text-center pb-8">
          <CardTitle className="text-2xl font-bold">Processing Assessment</CardTitle>
          <p className="text-muted-foreground mt-2">The AI is evaluating your profile against the role requirements.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-border -z-10" />
            <div className="space-y-6">
              {STAGES.map((stageName, idx) => {
                const isCompleted = idx < currentStageIdx;
                const isCurrent = idx === currentStageIdx;
                const isPending = idx > currentStageIdx;

                return (
                  <div key={stageName} className="flex items-center gap-4">
                    <div className="bg-background relative z-10">
                      {isCompleted ? (
                        <CheckCircle2 className="w-7 h-7 text-green-500 fill-green-50" />
                      ) : isCurrent ? (
                        <Loader2 className="w-7 h-7 text-primary animate-spin" />
                      ) : (
                        <Circle className="w-7 h-7 text-muted stroke-[1.5px]" />
                      )}
                    </div>
                    <span className={`text-base font-medium ${isCompleted ? 'text-foreground' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                      {stageName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="mt-8 text-center">
            {currentStageIdx === 5 && (
              <p className="text-sm font-medium text-primary animate-pulse">Redirecting to verification interview...</p>
            )}
            {currentStageIdx >= 6 && currentStageIdx < 8 && (
              <p className="text-sm font-medium text-primary animate-pulse">Synthesizing interview answers & generating final reports...</p>
            )}
            {currentStageIdx >= 8 && (
              <p className="text-sm font-medium text-green-500 animate-pulse">Assessment complete! Opening results...</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssessmentProgress;
