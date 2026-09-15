import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAssessmentStatus } from '@/hooks/useAssessment';
import { SEO } from '@/components/seo/SEO';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateReport from '@/components/CandidateReport';
import HiringReport from '@/components/HiringReport';

const AssessmentResult = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, isError } = useAssessmentStatus(id);
  const [activeTab, setActiveTab] = useState<'candidate' | 'hiring'>('candidate');

  useEffect(() => {
    // If we land here but the assessment is still processing, redirect to progress
    if (assessment && assessment.status !== 'completed' && assessment.status !== 'error') {
      navigate(`/assessment/${id}/progress`);
    }
  }, [assessment, navigate, id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center text-destructive">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Failed to load assessment results</h2>
          <p className="text-muted-foreground mt-2">Please try again later.</p>
        </div>
      </div>
    );
  }

  if (assessment.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center text-destructive">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Assessment Failed</h2>
          <p className="text-muted-foreground mt-2">An error occurred during the assessment process.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-4 pt-24 md:p-12 md:pt-32 relative">
      {/* Executive Bento Grid Mesh Background */}
      <div 
        className="fixed inset-0 pointer-events-none -z-10 bg-cover bg-center bg-no-repeat opacity-20 dark:opacity-25 transition-opacity duration-700"
        style={{ backgroundImage: `url('/backgrounds/dashboard-bento-mesh.jpg')` }}
      />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-gradient-to-b from-background/75 via-background/90 to-background" />

      <SEO title="Assessment Results" />
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assessment Results</h1>
            <p className="text-muted-foreground mt-1">Review the AI-generated verification reports.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 bg-secondary/10 p-1 rounded-xl w-fit">
          <Button 
            variant={activeTab === 'candidate' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('candidate')}
            className={`rounded-lg transition-all ${activeTab === 'candidate' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Candidate Report
          </Button>
          <Button 
            variant={activeTab === 'hiring' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('hiring')}
            className={`rounded-lg transition-all ${activeTab === 'hiring' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Hiring Report
          </Button>
        </div>
          
        <div className="mt-8">
          {activeTab === 'candidate' && (
            <CandidateReport report={assessment.candidateReport} />
          )}
          
          {activeTab === 'hiring' && (
            <HiringReport report={assessment.hiringReport} />
          )}
        </div>

      </div>
    </div>
  );
};

export default AssessmentResult;
