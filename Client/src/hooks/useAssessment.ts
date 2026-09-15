import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assessmentApi } from '../api/assessment.api';
import { toast } from 'sonner';
import { useAuth } from '@clerk/clerk-react';

export const useStartAssessment = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const token = await getToken();
      return assessmentApi.startAssessment(formData, token);
    },
    onSuccess: () => {
      // Invalidate relevant queries if necessary, maybe dashboard stats
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      console.error('Failed to start assessment:', error);
      if (error.response?.data?.code !== 'ACTIVE_ASSESSMENT') {
        toast.error(error.response?.data?.message || 'Failed to start assessment');
      }
    },
  });
};

export const useAssessmentStatus = (assessmentId: string | undefined) => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ['assessment', assessmentId],
    queryFn: async () => {
      if (!assessmentId) throw new Error("No assessment ID");
      const token = await getToken();
      const res = await assessmentApi.getAssessment(assessmentId, token);
      return res.assessment;
    },
    enabled: !!assessmentId,
    // Poll every 2.5 seconds while active, stop only on terminal states
    refetchInterval: (query) => {
      const status = query.state?.data?.status;
      if (status === 'completed' || status === 'error') {
        return false; // Terminal states
      }
      return 2500;
    },
  });
};

export const useAssessmentHistory = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ['assessmentHistory'],
    queryFn: async () => {
      const token = await getToken();
      return assessmentApi.listAssessments(token);
    },
  });
};
