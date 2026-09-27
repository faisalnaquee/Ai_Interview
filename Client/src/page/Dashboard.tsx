import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@/lib/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Award,
  BarChart,
  Briefcase,
  Calendar,
  ChevronRight,
  History,
  TrendingUp,
  PlusCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInterviewHistory } from '@/hooks/useInterview';
import { useAtsHistory } from '@/hooks/useAts';
import { useAssessmentHistory } from '@/hooks/useAssessment';
import { SEO } from '@/components/seo/SEO';

const Dashboard = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'interviews' | 'ats' | 'assessments'>('assessments');

  const { data: rawInterviews = [], isLoading: isLoadingInterviews, isError: isErrorInterviews } = useInterviewHistory();
  const { data: rawAtsScans = [], isLoading: isLoadingAts, isError: isErrorAts } = useAtsHistory();
  const { data: rawAssessments = [], isLoading: isLoadingAssessments, isError: isErrorAssessments } = useAssessmentHistory();

  const loading = isLoadingInterviews || isLoadingAts || isLoadingAssessments;
  const error = (isErrorInterviews || isErrorAts || isErrorAssessments) ? "Unable to load dashboard data." : "";

  // Filter and sort interviews
  const interviews = React.useMemo(() => {
    if (!Array.isArray(rawInterviews)) return [];
    const completed = rawInterviews.filter((inv: any) => inv.interview?.status === 'completed' && inv.interview?.result?.overallScore);
    return completed.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rawInterviews]);

  const atsScans = Array.isArray(rawAtsScans) ? rawAtsScans : [];
  const assessments = Array.isArray(rawAssessments) ? rawAssessments : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans pb-24 pt-24 px-6 md:px-12">
        <SEO title="Dashboard" noindex />
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <div className="grid lg:grid-cols-3 gap-8 mt-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-8 w-48 mb-4" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-8 w-48 mb-4" />
              <Skeleton className="h-[400px] w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <SEO title="Dashboard Error" noindex />
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  // Compute Stats
  const totalCompleted = interviews.length;
  const averageScore = totalCompleted > 0 
    ? Math.round(interviews.reduce((acc, curr) => acc + (curr.interview.result.overallScore || 0), 0) / totalCompleted)
    : 0;
  
  // Find best category
  let bestCategoryName = "None";
  if (totalCompleted > 0) {
    const categories = {
      Technical: 0,
      Communication: 0,
      "Problem Solving": 0
    };
    
    interviews.forEach(inv => {
      categories.Technical += inv.interview.result.technical || 0;
      categories.Communication += inv.interview.result.communication || 0;
      categories["Problem Solving"] += inv.interview.result.problemSolving || 0;
    });

    const best = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    bestCategoryName = best[0];
  }

  const getBadgeColor = (rec: string) => {
    const text = (rec || "").toLowerCase();
    if (text.includes("strong hire")) return "bg-secondary text-secondary-foreground hover:bg-secondary/90";
    if (text.includes("hire") && !text.includes("no")) return "bg-secondary/80 text-secondary-foreground hover:bg-secondary/90";
    if (text.includes("borderline")) return "bg-yellow-500 hover:bg-yellow-600 text-white";
    return "bg-destructive hover:bg-destructive/90 text-white";
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 pb-24 relative">
      {/* Executive Bento Grid Mesh Background */}
      <div 
        className="fixed inset-0 pointer-events-none -z-10 bg-cover bg-center bg-no-repeat opacity-20 dark:opacity-25 transition-opacity duration-700"
        style={{ backgroundImage: `url('/backgrounds/dashboard-bento-mesh.jpg')` }}
      />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-gradient-to-b from-background/75 via-background/90 to-background" />

      <SEO title="Dashboard" noindex />
      <div className="mx-auto max-w-6xl space-y-10 p-6 md:p-12 pt-24 md:pt-32 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome back, {user?.firstName || "Candidate"}</h1>
            <p className="text-muted-foreground">Track your progress and prepare for your next big role.</p>
          </div>
          <Link to="/assessment/setup">
            <Button size="lg" className="rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
              <PlusCircle className="w-5 h-5" />
              New Assessment
            </Button>
          </Link>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <Award className="w-5 h-5 text-secondary" />
                </div>
              </div>
              <h3 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-1">Average Score</h3>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-secondary">{averageScore}</span>
                <span className="text-muted-foreground mb-1">/ 100</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <History className="w-5 h-5 text-secondary" />
                </div>
              </div>
              <h3 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-1">Interviews Completed</h3>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-secondary">{totalCompleted}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                </div>
              </div>
              <h3 className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-1">Strongest Skill</h3>
              <div className="flex items-end gap-2 mt-2">
                <span className="text-2xl font-bold">{bestCategoryName}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-6 bg-secondary/10 p-1 rounded-xl w-fit">
          <Button 
            variant={activeTab === 'assessments' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('assessments')}
            className={`rounded-lg transition-all ${activeTab === 'assessments' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Assessments
          </Button>
          <Button 
            variant={activeTab === 'interviews' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('interviews')}
            className={`rounded-lg transition-all ${activeTab === 'interviews' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Mock Interviews
          </Button>
          <Button 
            variant={activeTab === 'ats' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('ats')}
            className={`rounded-lg transition-all ${activeTab === 'ats' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            ATS Scans
          </Button>
        </div>

        {/* Two Column Layout for History & Progress */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-4">
            
            {activeTab === 'interviews' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-muted-foreground" />
                  Recent Mock Interviews
                </h2>
                
                {interviews.length === 0 ? (
                  <Card className="border-dashed border-2 bg-muted/20 shadow-none h-48 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Briefcase className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No completed interviews yet.</p>
                    <Link to="/setup" className="mt-4">
                      <Button variant="outline" size="sm">Start Practice</Button>
                    </Link>
                  </Card>
                ) : (
                  interviews.map((inv: any) => (
                    <Link to={`/result/${inv._id}`} key={inv._id}>
                      <Card className="bg-card border-border shadow-sm rounded-2xl hover:border-secondary/50 hover:shadow-md transition-all cursor-pointer group mb-4">
                        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                              <span className="text-xl font-black text-foreground">{inv.interview.result.overallScore}</span>
                            </div>
                            <div>
                              <h3 className="font-bold text-lg group-hover:text-secondary transition-colors line-clamp-1">{inv.job_title || "Mock Interview"}</h3>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(inv.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                            <Badge className={`${getBadgeColor(inv.interview.result.recommendation)}`}>
                              {inv.interview.result.recommendation || "Completed"}
                            </Badge>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary group-hover:translate-x-1 transition-all" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            )}

            {activeTab === 'ats' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-muted-foreground" />
                  Recent ATS Scans
                </h2>
                
                {atsScans.length === 0 ? (
                  <Card className="border-dashed border-2 bg-muted/20 shadow-none h-48 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Briefcase className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No ATS scans yet.</p>
                    <Link to="/ats" className="mt-4">
                      <Button variant="outline" size="sm">Scan Resume</Button>
                    </Link>
                  </Card>
                ) : (
                  atsScans.map((scan: any) => (
                    <Card key={scan._id} className="bg-card border-border shadow-sm rounded-2xl hover:border-secondary/50 hover:shadow-md transition-all cursor-pointer group mb-4">
                      <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <Link to={`/ats?resultId=${scan._id}`} className="flex-grow flex items-start gap-4">
                          <div>
                            <h3 className="font-bold text-lg group-hover:text-secondary transition-colors line-clamp-1">{scan.resumeName || "Resume Scan"}</h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5"><Award className="w-4 h-4" /> {scan.matchStatus} Match</span>
                              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(scan.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                          <Link to="/setup" state={{ jdText: scan.jdSnippet }}>
                            <Button variant="ghost" size="sm">Practice this Job</Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Assessments Tab */}
            {activeTab === 'assessments' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-muted-foreground" />
                  Recent AI Assessments
                </h2>
                
                {assessments.length === 0 ? (
                  <Card className="border-dashed border-2 bg-muted/20 shadow-none h-48 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Briefcase className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No Assessments yet.</p>
                    <Link to="/assessment/setup" className="mt-4">
                      <Button variant="outline" size="sm">Check Readiness</Button>
                    </Link>
                  </Card>
                ) : (
                  assessments.map((assessment: any) => (
                    <Link to={assessment.status === 'completed' || assessment.status === 'error' ? `/assessment/${assessment._id}/result` : `/assessment/${assessment._id}/progress`} key={assessment._id}>
                      <Card className="bg-card border-border shadow-sm rounded-2xl hover:border-secondary/50 hover:shadow-md transition-all cursor-pointer group mb-4">
                        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                               {assessment.status === 'completed' && assessment.readinessScore !== undefined ? (
                                  <span className="text-xl font-black text-foreground">{assessment.readinessScore}</span>
                               ) : (
                                  <BarChart className="w-6 h-6 text-muted-foreground" />
                               )}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg group-hover:text-secondary transition-colors line-clamp-1">AI Assessment</h3>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(assessment.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                            <Badge variant={assessment.status === 'completed' ? 'default' : assessment.status === 'error' ? 'destructive' : 'outline'} className="uppercase">
                              {assessment.status}
                            </Badge>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary group-hover:translate-x-1 transition-all" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            )}
            
          </div>

          {/* Progress Timeline Tracker */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
              <BarChart className="w-5 h-5 text-muted-foreground" />
              Score Progression
            </h2>
            <Card className="bg-card border-border shadow-sm rounded-2xl">
              <CardContent className="p-6">
                {interviews.length < 2 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">Complete at least two interviews to see your progress trend.</p>
                  </div>
                ) : (
                  <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                    {/* Reverse array to show chronological order bottom to top visually */}
                    {[...interviews].reverse().map((inv: any, i: number, arr: any[]) => {
                      const prevScore = i > 0 ? arr[i - 1].interview.result.overallScore : null;
                      const currScore = inv.interview.result.overallScore;
                      const improved = prevScore ? currScore > prevScore : null;
                      const stayed = prevScore ? currScore === prevScore : null;
                      
                      return (
                        <div key={inv._id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-background bg-muted-foreground text-background font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow absolute left-0 md:left-1/2 -translate-x-1/2">
                            <span className={`w-2 h-2 rounded-full ${improved ? 'bg-secondary' : (stayed ? 'bg-yellow-500' : 'bg-destructive')}`}></span>
                          </div>
                          
                          <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] pl-4 md:pl-0 md:group-odd:pr-4 md:group-even:pl-4">
                            <div className="p-3 bg-muted/30 rounded-xl border border-border flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground">Int #{i + 1}</span>
                                <span className="font-semibold">{currScore}/100</span>
                              </div>
                              {improved !== null && !stayed && (
                                <span className={`text-xs font-bold ${improved ? 'text-secondary' : 'text-destructive'}`}>
                                  {improved ? '+' : ''}{currScore - prevScore} pts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
