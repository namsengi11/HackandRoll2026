import { supabase } from './supabaseClient';
import type { FeedItem, ReportReason } from '../api/types';

// Database types (matching Supabase schema)
export interface Label {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
}

export interface Submission {
  id: string;
  uploader_id: string;
  image_path: string;
  label_id: number;
  caption: string | null;
  created_at: string;
  report_count: number;
  status: 'active' | 'flagged' | 'rejected';
  coarse_label_id?: number | null;
  coarse_confidence?: number | null;
  fine_dex_entry_id?: number | null;
  fine_confidence?: number | null;
}

export interface UserStats {
  user_id: string;
  points: number;
  uploads_count: number;
  likes_received: number;
  reports_received: number;
  flagged_count: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
  icon: string;
}

export interface UserBadge {
  user_id: string;
  badge_id: string;
  earned_at: string;
}

// Feed item with joined data
export interface FeedItemWithData extends Submission {
  label_name: string;
  uploader_name: string;
  uploader_username: string;
  likes_count: number;
  my_liked: boolean;
  my_saved: boolean;
}

export const supabaseApi = {
  // Labels
  async getLabels(): Promise<Label[]> {
    const { data, error } = await supabase
      .from('labels')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data || [];
  },

  // Feed
  async getFeed(
    userId: string | null,
    filter: 'for-you' | 'new' = 'for-you',
    cursor?: { created_at: string; id: string },
    limit: number = 10
  ): Promise<{ items: FeedItem[]; nextCursor: { created_at: string; id: string } | null }> {
    try {
      // Build query - fetch submissions first, then join labels and profiles separately
      let query = supabase
        .from('submissions')
        .select('*')
        .in('status', ['active', 'flagged'])
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      // Pagination cursor
      if (cursor) {
        query = query.lt('created_at', cursor.created_at)
          .or(`created_at.eq.${cursor.created_at},id.lt.${cursor.id}`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Feed query error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return { items: [], nextCursor: null };
      }

      const submissions = data.slice(0, limit);
      const submissionIds = submissions.map((s: any) => s.id);
      const labelIds = [...new Set(submissions.map((s: any) => s.label_id))];
      const uploaderIds = [...new Set(submissions.map((s: any) => s.uploader_id))];

      if (submissionIds.length === 0) {
        return { items: [], nextCursor: null };
      }

      // Fetch labels, profiles, likes, and saves in parallel
      const [labelsResult, profilesResult, likesCountsResult, userLikesResult, userSavesResult] = await Promise.all([
        supabase
          .from('labels')
          .select('id, name')
          .in('id', labelIds),
        supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', uploaderIds),
        supabase
          .from('likes')
          .select('submission_id')
          .in('submission_id', submissionIds),
        userId && submissionIds.length > 0
          ? supabase
              .from('likes')
              .select('submission_id')
              .eq('user_id', userId)
              .in('submission_id', submissionIds)
          : { data: [], error: null },
        userId && submissionIds.length > 0
          ? supabase
              .from('saves')
              .select('submission_id')
              .eq('user_id', userId)
              .in('submission_id', submissionIds)
          : { data: [], error: null },
      ]);

      // Create lookup maps
      const labelsMap = new Map((labelsResult.data || []).map((l: any) => [l.id, l]));
      const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));

      // Count likes per submission
      const likesBySubmission = new Map<string, number>();
      (likesCountsResult.data || []).forEach((like: any) => {
        const count = likesBySubmission.get(like.submission_id) || 0;
        likesBySubmission.set(like.submission_id, count + 1);
      });

      const myLikedSet = new Set(((userLikesResult.data || []) as any[]).map((l: any) => l.submission_id));
      const mySavedSet = new Set(((userSavesResult.data || []) as any[]).map((s: any) => s.submission_id));

      // Build feed items
      const items: FeedItem[] = submissions.map((s: any) => {
        const label = labelsMap.get(s.label_id);
        const profile = profilesMap.get(s.uploader_id);
        const imageUrl = supabase.storage.from('submissions').getPublicUrl(s.image_path).data.publicUrl;

        return {
          id: s.id,
          submissionId: s.id,
          imageUrl,
          labelId: s.label_id,
          labelName: label?.name || 'Unknown',
          uploaderName: profile?.display_name || profile?.username || 'Unknown',
          uploaderId: s.uploader_id,
          status: s.status === 'active' ? 'pending' : 'verified' as 'pending' | 'verified',
          createdAt: s.created_at,
          likes: likesBySubmission.get(s.id) || 0,
          savedByMe: mySavedSet.has(s.id),
          likedByMe: myLikedSet.has(s.id),
          reportCount: s.report_count || 0,
          flagged: s.status === 'flagged' || s.status === 'rejected',
          caption: s.caption || undefined,
            reason: filter === 'new' ? 'new' as const : 'popular' as const,
        };
      });

      // Sort for "For You" tab (client-side ranking)
      if (filter === 'for-you') {
        items.sort((a, b) => {
          const now = Date.now();
          const aAge = now - new Date(a.createdAt).getTime();
          const bAge = now - new Date(b.createdAt).getTime();
          const aRecencyBoost = Math.max(0, 100 - aAge / (1000 * 60 * 60));
          const bRecencyBoost = Math.max(0, 100 - bAge / (1000 * 60 * 60));
          const aScore = a.likes * 2 - a.reportCount * 5 + aRecencyBoost;
          const bScore = b.likes * 2 - b.reportCount * 5 + bRecencyBoost;
          return bScore - aScore;
        });
      }

      const nextCursor =
        data.length > limit
          ? { created_at: items[items.length - 1].createdAt, id: items[items.length - 1].id }
          : null;

      return { items, nextCursor };
    } catch (error) {
      console.error('Error fetching feed:', error);
      throw error;
    }
  },

  // Like/Unlike
  async toggleLike(submissionId: string, userId: string): Promise<boolean> {
    // Check if already liked
    const { data: existing } = await supabase
      .from('likes')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Unlike
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('submission_id', submissionId)
        .eq('user_id', userId);
      if (error) throw error;
      return false;
    } else {
      // Like
      const { error } = await supabase
        .from('likes')
        .insert({ submission_id: submissionId, user_id: userId });
      if (error) throw error;
      return true;
    }
  },

  // Save/Unsave
  async toggleSave(submissionId: string, userId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('saves')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('saves')
        .delete()
        .eq('submission_id', submissionId)
        .eq('user_id', userId);
      if (error) throw error;
      return false;
    } else {
      const { error } = await supabase
        .from('saves')
        .insert({ submission_id: submissionId, user_id: userId });
      if (error) throw error;
      return true;
    }
  },

  // Report
  async reportSubmission(
    submissionId: string,
    reporterId: string,
    reason: ReportReason,
    details?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('reports')
      .insert({
        submission_id: submissionId,
        reporter_id: reporterId,
        reason,
        details: details || null,
      });

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('You have already reported this submission');
      }
      throw error;
    }
  },

  // Upload
  async createSubmission(
    userId: string,
    file: File,
    labelId: number,
    caption?: string,
    coarseLabelId?: number | null,
    coarseConfidence?: number | null,
    fineDexEntryId?: number | null,
    fineConfidence?: number | null
  ): Promise<Submission> {
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      throw new Error('User not authenticated or user ID mismatch');
    }

    // Generate submission ID
    const submissionId = crypto.randomUUID();
    const imagePath = `${userId}/${submissionId}.jpg`;

    // Upload to storage
    const { data: uploadData, error: storageError } = await supabase.storage
      .from('submissions')
      .upload(imagePath, file, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      console.error('Error details:', {
        message: storageError.message,
        name: storageError.name,
      });
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    console.log('Storage upload successful:', uploadData);

    // Insert submission record
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        id: submissionId,
        uploader_id: userId,
        image_path: imagePath,
        label_id: labelId,
        caption: caption || null,
        status: 'active', // Explicitly set status
        report_count: 0, // Explicitly set report_count
        coarse_label_id: coarseLabelId || null,
        coarse_confidence: coarseConfidence || null,
        fine_dex_entry_id: fineDexEntryId || null,
        fine_confidence: fineConfidence || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      // Clean up storage on error
      await supabase.storage.from('submissions').remove([imagePath]);
      throw new Error(`Failed to create submission: ${error.message} (Code: ${error.code})`);
    }

    return data;
  },

  // Get user submissions
  async getUserSubmissions(userId: string): Promise<Submission[]> {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('uploader_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get leaderboard
  async getLeaderboard(limit: number = 50, currentUserId?: string): Promise<(UserStats & { profile: Profile })[]> {
    // Fetch user_stats and profiles separately since there's no direct FK
    const { data: statsData, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .order('points', { ascending: false })
      .limit(limit);

    if (statsError) throw statsError;
    if (!statsData || statsData.length === 0) return [];

    // If current user is provided and not in top results, fetch their stats separately
    const topUserIds = statsData.map((s: any) => s.user_id);
    const currentUserInTop = currentUserId && topUserIds.includes(currentUserId);
    
    let allStatsData = [...statsData];
    if (currentUserId && !currentUserInTop) {
      const { data: currentUserStats, error: currentUserError } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle();
      
      if (!currentUserError && currentUserStats) {
        allStatsData.push(currentUserStats);
        // Re-sort to maintain order
        allStatsData.sort((a: any, b: any) => b.points - a.points);
      }
    }

    const userIds = allStatsData.map((s: any) => s.user_id);
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

    return allStatsData.map((stat: any) => ({
      ...stat,
      profile: profilesMap.get(stat.user_id) || { id: stat.user_id, username: 'Unknown', display_name: 'Unknown User' },
    }));
  },

  // Get badges
  async getBadges(): Promise<Badge[]> {
    const { data, error } = await supabase
      .from('badges')
      .select('*');

    if (error) throw error;
    return data || [];
  },

  // Get user badges
  async getUserBadges(userId: string): Promise<UserBadge[]> {
    const { data, error } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  },

  // Award badge
  async awardBadge(userId: string, badgeId: string): Promise<void> {
    const { error } = await supabase
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badgeId,
      });

    if (error && error.code !== '23505') { // Ignore duplicate
      throw error;
    }
  },
};
