import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useAuth } from '../contexts/AuthContext';
import { FeedPost } from '../components/FeedPost';
import { FeedSkeleton } from '../components/FeedSkeleton';
import { EmptyState } from '../components/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Compass, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

export function Feed() {
  const { user } = useAuth();
  const {
    feedByTab,
    loadingByTab,
    hasMoreByTab,
    fetchFeed,
    fetchNextFeedPage,
    refreshFeed,
    likeFeedItem,
    saveFeedItem,
    reportFeedItem,
  } = useStore();
  const [activeTab, setActiveTab] = useState<'for-you' | 'new'>('for-you');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const currentFeed = feedByTab[activeTab];
  const isLoading = loadingByTab[activeTab];
  const hasMore = hasMoreByTab[activeTab];

  useEffect(() => {
    fetchFeed(user?.id || null, activeTab);
  }, [activeTab, user?.id]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          fetchNextFeedPage(user?.id || null, activeTab);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [activeTab, hasMore, isLoading, fetchNextFeedPage, currentFeed.length]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as typeof activeTab);
  };

  const handleRefresh = () => {
    refreshFeed(user?.id || null, activeTab);
  };

  const handleLike = (itemId: string) => {
    if (!user) return; // Shouldn't happen since route is protected
    likeFeedItem(itemId, user.id);
  };

  const handleSave = (itemId: string) => {
    if (!user) return;
    saveFeedItem(itemId, user.id);
  };

  const handleReport = (itemId: string, reason: any, details?: string) => {
    if (!user) return;
    reportFeedItem(itemId, user.id, reason, details);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Discovery</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scroll the finds. Keep it clean.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="for-you" className="flex items-center gap-2">
              <Compass className="h-4 w-4" />
              For You
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              New
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Feed Content */}
      <div className="space-y-4">
        {isLoading && currentFeed.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <FeedSkeleton key={i} />
            ))}
          </div>
        ) : currentFeed.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No items found"
            description={`There are no ${activeTab} items in the feed right now. Check back soon!`}
          />
        ) : (
          <>
            <div className="space-y-4">
              {currentFeed.map((item) => (
                <FeedPost
                  key={item.id}
                  item={item}
                  onLike={() => handleLike(item.submissionId)}
                  onSave={() => handleSave(item.submissionId)}
                  onReport={(reason, details) => handleReport(item.submissionId, reason, details)}
                />
              ))}
            </div>

            {/* Loading more skeletons */}
            {isLoading && currentFeed.length > 0 && (
              <div className="space-y-4 mt-4">
                <FeedSkeleton />
                <FeedSkeleton />
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="h-10" />
            )}

            {/* End of feed */}
            {!hasMore && currentFeed.length > 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                You've reached the end of the feed
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
