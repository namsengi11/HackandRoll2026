import { create } from 'zustand';
import { supabaseApi } from '../lib/supabaseApi';
import type { FeedItem, ReportReason } from '../api/types';
import type { Label, Submission, UserStats, Badge } from '../lib/supabaseApi';

interface AppState {
  // Data
  labels: Label[];
  userSubmissions: Submission[];
  leaderboard: (UserStats & { profile: any })[];
  badges: Badge[];
  userBadges: string[]; // badge IDs
  
  // Feed (paginated by tab)
  feedByTab: Record<'for-you' | 'new', FeedItem[]>;
  cursorByTab: Record<'for-you' | 'new', { created_at: string; id: string } | null>;
  hasMoreByTab: Record<'for-you' | 'new', boolean>;
  loadingByTab: Record<'for-you' | 'new', boolean>;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Computed
  earnedBadges: Badge[];
  
  // Actions
  fetchLabels: () => Promise<void>;
  submitImage: (file: File, labelId: number, caption?: string) => Promise<Submission>;
  fetchUserSubmissions: (userId: string) => Promise<void>;
  fetchLeaderboard: (userId?: string) => Promise<void>;
  
  // Feed
  fetchFeed: (userId: string | null, filter?: 'for-you' | 'new', cursor?: { created_at: string; id: string }) => Promise<void>;
  fetchNextFeedPage: (userId: string | null, filter: 'for-you' | 'new') => Promise<void>;
  refreshFeed: (userId: string | null, filter: 'for-you' | 'new') => Promise<void>;
  likeFeedItem: (submissionId: string, userId: string) => Promise<void>;
  saveFeedItem: (submissionId: string, userId: string) => Promise<void>;
  reportFeedItem: (submissionId: string, userId: string, reason: ReportReason, details?: string) => Promise<void>;
  
  // Badges
  fetchBadges: () => Promise<void>;
  fetchUserBadges: (userId: string) => Promise<void>;
  awardBadge: (userId: string, badgeId: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  labels: [],
  userSubmissions: [],
  leaderboard: [],
  badges: [],
  userBadges: [],
  feedByTab: {
    'for-you': [],
    new: [],
  },
  cursorByTab: {
    'for-you': null,
    new: null,
  },
  hasMoreByTab: {
    'for-you': true,
    new: true,
  },
  loadingByTab: {
    'for-you': false,
    new: false,
  },
  isLoading: false,
  error: null,
  earnedBadges: [],

  fetchLabels: async () => {
    try {
      const labels = await supabaseApi.getLabels();
      set({ labels });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch labels' });
    }
  },

  submitImage: async (_file: File, _labelId: number, _caption?: string) => {
    // This is now handled directly in Upload component using supabaseApi
    throw new Error('submitImage is deprecated - use supabaseApi.createSubmission directly');
  },

  fetchUserSubmissions: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const submissions = await supabaseApi.getUserSubmissions(userId);
      set({ userSubmissions: submissions, isLoading: false });
    } catch (error) {
      console.error('Error fetching user submissions:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch submissions', isLoading: false });
    }
  },

  fetchLeaderboard: async (userId?: string) => {
    try {
      const leaderboard = await supabaseApi.getLeaderboard(50, userId);
      set({ leaderboard });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch leaderboard' });
    }
  },

  fetchFeed: async (userId: string | null, filter: 'for-you' | 'new' = 'for-you', cursor?: { created_at: string; id: string }) => {
    const tab = filter;
    set((state) => ({
      loadingByTab: { ...state.loadingByTab, [tab]: true },
      error: null,
    }));
    try {
      const { items, nextCursor } = await supabaseApi.getFeed(userId, filter, cursor);
      set((state) => ({
        feedByTab: {
          ...state.feedByTab,
          [tab]: cursor ? [...state.feedByTab[tab], ...items] : items,
        },
        cursorByTab: {
          ...state.cursorByTab,
          [tab]: nextCursor,
        },
        hasMoreByTab: {
          ...state.hasMoreByTab,
          [tab]: nextCursor !== null,
        },
        loadingByTab: { ...state.loadingByTab, [tab]: false },
      }));
    } catch (error) {
      console.error('Store fetchFeed error:', error);
      set((state) => ({
        error: error instanceof Error ? error.message : 'Failed to fetch feed',
        loadingByTab: { ...state.loadingByTab, [tab]: false },
      }));
      // Show error toast
      if (error instanceof Error) {
        console.error('Feed error details:', error.message);
      }
    }
  },

  fetchNextFeedPage: async (userId: string | null, filter: 'for-you' | 'new') => {
    const tab = filter;
    const state = get();
    if (!state.hasMoreByTab[tab] || state.loadingByTab[tab]) return;
    
    await get().fetchFeed(userId, filter, state.cursorByTab[tab] || undefined);
  },

  refreshFeed: async (userId: string | null, filter: 'for-you' | 'new') => {
    const tab = filter;
    set((state) => ({
      feedByTab: { ...state.feedByTab, [tab]: [] },
      cursorByTab: { ...state.cursorByTab, [tab]: null },
      hasMoreByTab: { ...state.hasMoreByTab, [tab]: true },
    }));
    await get().fetchFeed(userId, filter);
  },

  likeFeedItem: async (submissionId: string, userId: string) => {
    try {
      const liked = await supabaseApi.toggleLike(submissionId, userId);
      // Optimistically update UI
      set((state) => {
        const updatedFeedByTab = { ...state.feedByTab };
        Object.keys(updatedFeedByTab).forEach((tab) => {
          updatedFeedByTab[tab as keyof typeof updatedFeedByTab] = updatedFeedByTab[
            tab as keyof typeof updatedFeedByTab
          ].map((item) => {
            if (item.submissionId === submissionId) {
              return {
                ...item,
                likedByMe: liked,
                likes: liked ? item.likes + 1 : Math.max(0, item.likes - 1),
              };
            }
            return item;
          });
        });
        return { feedByTab: updatedFeedByTab };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to like item' });
    }
  },

  saveFeedItem: async (submissionId: string, userId: string) => {
    try {
      const saved = await supabaseApi.toggleSave(submissionId, userId);
      set((state) => {
        const updatedFeedByTab = { ...state.feedByTab };
        Object.keys(updatedFeedByTab).forEach((tab) => {
          updatedFeedByTab[tab as keyof typeof updatedFeedByTab] = updatedFeedByTab[
            tab as keyof typeof updatedFeedByTab
          ].map((item) => {
            if (item.submissionId === submissionId) {
              return { ...item, savedByMe: saved };
            }
            return item;
          });
        });
        return { feedByTab: updatedFeedByTab };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save item' });
    }
  },

  reportFeedItem: async (submissionId: string, userId: string, reason: ReportReason, details?: string) => {
    try {
      await supabaseApi.reportSubmission(submissionId, userId, reason, details);
      // Update local state
      set((state) => {
        const updatedFeedByTab = { ...state.feedByTab };
        Object.keys(updatedFeedByTab).forEach((tab) => {
          updatedFeedByTab[tab as keyof typeof updatedFeedByTab] = updatedFeedByTab[
            tab as keyof typeof updatedFeedByTab
          ].map((item) => {
            if (item.submissionId === submissionId) {
              return {
                ...item,
                reportCount: item.reportCount + 1,
                flagged: item.reportCount + 1 >= 2,
              };
            }
            return item;
          });
        });
        return { feedByTab: updatedFeedByTab };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to report item' });
      throw error;
    }
  },

  fetchBadges: async () => {
    try {
      const badges = await supabaseApi.getBadges();
      set({ badges });
    } catch (error) {
      console.error('Error fetching badges:', error);
      // Don't set error state for badges - it's okay if there are no badges
      set({ badges: [] });
    }
  },

  fetchUserBadges: async (userId: string) => {
    try {
      const userBadges = await supabaseApi.getUserBadges(userId);
      const badgeIds = userBadges.map((ub) => ub.badge_id);
      const earned = get().badges.filter((b) => badgeIds.includes(b.id));
      set({ userBadges: badgeIds, earnedBadges: earned });
    } catch (error) {
      console.error('Error fetching user badges:', error);
      // Don't set error state - it's okay if user has no badges yet
      set({ userBadges: [], earnedBadges: [] });
    }
  },

  awardBadge: async (userId: string, badgeId: string) => {
    try {
      await supabaseApi.awardBadge(userId, badgeId);
      await get().fetchUserBadges(userId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to award badge' });
    }
  },
}));
