import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Heart, Bookmark, Share2, MoreHorizontal, Clock, Flag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTimeAgo } from '../utils/formatting';
import { ReasonPill } from './ReasonPill';
import { ReportDialog } from './ReportDialog';
import { toast } from 'sonner';
import type { FeedItem, ReportReason } from '../api/types';
import { cn } from '../lib/utils';

interface FeedPostProps {
  item: FeedItem;
  onLike: () => void;
  onSave: () => void;
  onReport: (reason: ReportReason, details?: string) => void;
}

// Generate avatar from name
function getAvatarInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function FeedPost({ item, onLike, onSave, onReport }: FeedPostProps) {
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const lastTapRef = useRef<number>(0);
  const imageRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (!item.likedByMe) {
        onLike();
        setShowHeartAnimation(true);
        setTimeout(() => setShowHeartAnimation(false), 1000);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/feed/${item.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    } catch {
      toast.success('Link copied');
    }
  };

  const handleReport = (reason: ReportReason, details?: string) => {
    onReport(reason, details);
    toast.success('Report received — thanks for keeping RareDex clean.');
    setShowMenu(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <Card className="mb-4 overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold text-sm">
              {getAvatarInitials(item.uploaderName)}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{item.uploaderName}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(item.createdAt)}
              </div>
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <MoreHorizontal className="h-5 w-5 text-gray-600" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={() => {
                    setShowReportDialog(true);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Flag className="h-4 w-4" />
                  Report
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Image */}
      <div
        ref={imageRef}
        className="relative bg-gray-100 cursor-pointer select-none"
        onDoubleClick={handleDoubleTap}
        onTouchEnd={handleDoubleTap}
      >
        <img
          src={item.imageUrl}
          alt={item.labelName}
          className="w-full aspect-square object-cover"
        />
        
        {/* Double-tap heart animation */}
        <AnimatePresence>
          {showHeartAnimation && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0] }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="h-20 w-20 text-red-500 fill-red-500" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reason pill overlay */}
        {item.reason && (
          <div className="absolute top-2 right-2">
            <ReasonPill reason={item.reason} />
          </div>
        )}
      </div>

      {/* Actions */}
      <CardContent className="pt-4">
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onLike}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  item.likedByMe
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <motion.div
                  animate={{ scale: item.likedByMe ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Heart className={cn('h-6 w-6', item.likedByMe && 'fill-current')} />
                </motion.div>
              </button>
              <button
                onClick={onSave}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  item.savedByMe
                    ? 'text-yellow-500 hover:bg-yellow-50'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <Bookmark className={cn('h-6 w-6', item.savedByMe && 'fill-current')} />
              </button>
              <button
                onClick={handleShare}
                className="p-2 rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Share2 className="h-6 w-6" />
              </button>
            </div>
            {item.flagged && (
              <Badge variant="warning" className="text-xs">
                Flagged
              </Badge>
            )}
          </div>

          {/* Like count */}
          {item.likes > 0 && (
            <div className="font-semibold text-gray-900">
              {item.likes} {item.likes === 1 ? 'like' : 'likes'}
            </div>
          )}

          {/* Caption */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {item.labelName}
              </Badge>
            </div>
            {item.caption && (
              <p className="text-gray-900">
                <span className="font-semibold">{item.uploaderName}</span>{' '}
                {item.caption}
              </p>
            )}
          </div>
          {item.reportCount > 0 && (
            <div className="text-xs text-gray-500 mt-2">
              {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
            </div>
          )}
        </div>
      </CardContent>
      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        onSubmit={handleReport}
        itemLabel={item.labelName}
      />
    </Card>
  );
}
