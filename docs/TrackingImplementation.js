/**
 * AFFILIATE TRACKING & ANALYTICS IMPLEMENTATION
 * 
 * File: server/ecommerce-backend/routes/tracking.js
 * 
 * Endpoints to record views, clicks, and conversions for listings
 */

const express = require('express');
const router = express.Router();
const Listing = require('../models/Product'); // Product model extends with tracking
const ListingTrack = require('../models/ListingTrack');

/**
 * POST /api/tracking/view
 * 
 * Record a view event when user opens ListingDetail page
 * 
 * Body:
 * {
 *   listingId: string,
 *   listingType: 'product' | 'tool' | 'job'
 * }
 */
router.post('/view', async (req, res) => {
  try {
    const { listingId, listingType } = req.body;
    
    if (!listingId) {
      return res.status(400).json({ error: 'listingId required' });
    }

    // Increment view counter on listing
    await Listing.findByIdAndUpdate(
      listingId,
      { $inc: { views: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType,
      eventType: 'view',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ error: 'Failed to record view' });
  }
});

/**
 * POST /api/tracking/click
 * 
 * Record a click event when user clicks external link (tool) or apply link (job)
 * 
 * Body:
 * {
 *   listingId: string,
 *   listingType: 'tool' | 'job',
 *   clickType: 'visit_link' | 'apply' | 'add_to_cart' | 'buy_now'
 * }
 */
router.post('/click', async (req, res) => {
  try {
    const { listingId, listingType, clickType } = req.body;
    
    if (!listingId || !clickType) {
      return res.status(400).json({ error: 'listingId and clickType required' });
    }

    // Increment click counter on listing
    await Listing.findByIdAndUpdate(
      listingId,
      { $inc: { clicks: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType,
      eventType: 'click',
      clickType, // 'visit_link' for tools, 'apply' for jobs, 'add_to_cart'/'buy_now' for products
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Click tracking error:', error);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

/**
 * POST /api/tracking/conversion
 * 
 * Record a conversion (purchase/signup/etc)
 * 
 * Body:
 * {
 *   listingId: string,
 *   listingType: 'product' | 'tool' | 'job',
 *   conversionType: 'purchase' | 'signup' | 'application' | 'newsletter'
 *   conversionValue?: number (revenue, if applicable)
 * }
 */
router.post('/conversion', async (req, res) => {
  try {
    const { listingId, listingType, conversionType, conversionValue } = req.body;
    
    if (!listingId || !conversionType) {
      return res.status(400).json({ error: 'listingId and conversionType required' });
    }

    // Increment conversion counter on listing
    await Listing.findByIdAndUpdate(
      listingId,
      { $inc: { conversions: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType,
      eventType: 'conversion',
      conversionType,
      conversionValue: conversionValue || 0,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Conversion tracking error:', error);
    res.status(500).json({ error: 'Failed to record conversion' });
  }
});

/**
 * GET /api/tracking/analytics/:listingId
 * 
 * Get detailed analytics for a specific listing
 */
router.get('/analytics/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { startDate, endDate } = req.query;

    // Get listing with counters
    const listing = await Listing.findById(listingId).select('views clicks conversions');

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Get event breakdown
    const query = { listingId };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const events = await ListingTrack.find(query);

    // Calculate CTR (Click-Through Rate)
    const views = listing.views || 0;
    const clicks = listing.clicks || 0;
    const conversions = listing.conversions || 0;
    const ctr = views > 0 ? ((clicks / views) * 100).toFixed(2) : 0;
    const conversionRate = clicks > 0 ? ((conversions / clicks) * 100).toFixed(2) : 0;

    // Break down by click type
    const clickBreakdown = {};
    events
      .filter(e => e.eventType === 'click')
      .forEach(e => {
        clickBreakdown[e.clickType] = (clickBreakdown[e.clickType] || 0) + 1;
      });

    res.json({
      listing: {
        id: listing._id,
        views,
        clicks,
        conversions,
        ctr: parseFloat(ctr),
        conversionRate: parseFloat(conversionRate)
      },
      eventBreakdown: {
        views: events.filter(e => e.eventType === 'view').length,
        clicks: events.filter(e => e.eventType === 'click').length,
        conversions: events.filter(e => e.eventType === 'conversion').length
      },
      clickBreakdown,
      timeline: generateTimeline(events)
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/tracking/analytics
 * 
 * Get aggregate analytics across all listings
 */
router.get('/analytics', async (req, res) => {
  try {
    const { type } = req.query; // Filter by type: product, tool, job

    const query = { eventType: { $in: ['view', 'click', 'conversion'] } };
    if (type) query.listingType = type;

    const events = await ListingTrack.find(query);

    const totalViews = events.filter(e => e.eventType === 'view').length;
    const totalClicks = events.filter(e => e.eventType === 'click').length;
    const totalConversions = events.filter(e => e.eventType === 'conversion').length;

    res.json({
      summary: {
        totalViews,
        totalClicks,
        totalConversions,
        overallCTR: totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0,
        conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : 0
      },
      byType: aggregateByType(events),
      topClickTypes: getTopClickTypes(events)
    });
  } catch (error) {
    console.error('Aggregate analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * Helper: Generate daily/hourly timeline
 */
function generateTimeline(events) {
  const timeline = {};
  events.forEach(event => {
    const date = new Date(event.timestamp).toLocaleDateString();
    if (!timeline[date]) {
      timeline[date] = { views: 0, clicks: 0, conversions: 0 };
    }
    timeline[date][`${event.eventType}s`]++;
  });
  return timeline;
}

/**
 * Helper: Aggregate by listing type
 */
function aggregateByType(events) {
  const byType = {
    product: { views: 0, clicks: 0, conversions: 0 },
    tool: { views: 0, clicks: 0, conversions: 0 },
    job: { views: 0, clicks: 0, conversions: 0 }
  };

  events.forEach(event => {
    const type = event.listingType || 'product';
    if (byType[type]) {
      byType[type][`${event.eventType}s`]++;
    }
  });

  return byType;
}

/**
 * Helper: Get most clicked action types
 */
function getTopClickTypes(events) {
  const clickTypes = {};
  events
    .filter(e => e.eventType === 'click')
    .forEach(e => {
      clickTypes[e.clickType] = (clickTypes[e.clickType] || 0) + 1;
    });

  return Object.entries(clickTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));
}

module.exports = router;

/**
 * ============================================
 * FRONTEND TRACKING INTEGRATION
 * ============================================
 * 
 * File: client/src/services/trackingService.js
 */

const trackingService = {
  /**
   * Record view event when user opens listing
   */
  recordView: async (listingId, listingType) => {
    try {
      await fetch('/api/tracking/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, listingType })
      });
    } catch (error) {
      console.warn('Failed to record view:', error);
      // Silently fail - don't disrupt user experience
    }
  },

  /**
   * Record click event (affiliate link, apply link, add to cart, buy)
   */
  recordClick: async (listingId, listingType, clickType) => {
    try {
      await fetch('/api/tracking/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, listingType, clickType })
      });
    } catch (error) {
      console.warn('Failed to record click:', error);
    }
  },

  /**
   * Record conversion (purchase, signup, etc)
   */
  recordConversion: async (listingId, listingType, conversionType, conversionValue) => {
    try {
      await fetch('/api/tracking/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listingId, 
          listingType, 
          conversionType,
          conversionValue 
        })
      });
    } catch (error) {
      console.warn('Failed to record conversion:', error);
    }
  },

  /**
   * Get analytics for a specific listing
   */
  getListingAnalytics: async (listingId, startDate, endDate) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/tracking/analytics/${listingId}?${params}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return null;
    }
  },

  /**
   * Get aggregate analytics
   */
  getAggregateAnalytics: async (type) => {
    try {
      const params = new URLSearchParams();
      if (type) params.append('type', type);

      const response = await fetch(`/api/tracking/analytics?${params}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch aggregate analytics:', error);
      return null;
    }
  }
};

/**
 * ============================================
 * USAGE IN LISTINGDETAIL.JSX
 * ============================================
 * 
 * import trackingService from '@/services/trackingService';
 * 
 * // On component mount, record view
 * useEffect(() => {
 *   if (listing?._id) {
 *     trackingService.recordView(listing._id, listing.type || 'product');
 *   }
 * }, [listing?._id, listing?.type]);
 * 
 * // On external link click (tools, jobs)
 * const handleExternalLinkClick = async () => {
 *   await trackingService.recordClick(
 *     listing._id,
 *     listing.type,
 *     listing.type === 'job' ? 'apply' : 'visit_link'
 *   );
 *   window.open(listing.externalLink, '_blank');
 * };
 * 
 * // On add to cart (products)
 * const handleAddToCart = async () => {
 *   await trackingService.recordClick(listing._id, 'product', 'add_to_cart');
 *   // Add to cart logic...
 * };
 * 
 * // On buy now (products)
 * const handleBuyNow = async () => {
 *   await trackingService.recordClick(listing._id, 'product', 'buy_now');
 *   // Checkout logic...
 * };
 * 
 * // After successful purchase/conversion
 * const handleCheckoutSuccess = async (revenue) => {
 *   await trackingService.recordConversion(
 *     listing._id,
 *     'product',
 *     'purchase',
 *     revenue
 *   );
 * };
 */

module.exports = trackingService;
