/**
 * Tracking Routes
 * 
 * File: server/ecommerce-backend/routes/tracking.js
 * Purpose: Record analytics events (views, clicks, conversions) for listings
 */

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
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
    await Product.findByIdAndUpdate(
      listingId,
      { $inc: { views: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType: listingType || 'product',
      eventType: 'view',
      userId: req.user?.id || null,
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
 * or adds to cart / buys product
 * 
 * Body:
 * {
 *   listingId: string,
 *   listingType: 'tool' | 'job' | 'product',
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
    await Product.findByIdAndUpdate(
      listingId,
      { $inc: { clicks: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType: listingType || 'product',
      eventType: 'click',
      clickType,
      userId: req.user?.id || null,
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
 * Record a conversion (purchase/signup/application/etc)
 * 
 * Body:
 * {
 *   listingId: string,
 *   listingType: 'product' | 'tool' | 'job',
 *   conversionType: 'purchase' | 'signup' | 'application' | 'newsletter',
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
    await Product.findByIdAndUpdate(
      listingId,
      { $inc: { conversions: 1 } },
      { new: true }
    );

    // Record event for analytics
    await ListingTrack.create({
      listingId,
      listingType: listingType || 'product',
      eventType: 'conversion',
      conversionType,
      conversionValue: conversionValue || 0,
      userId: req.user?.id || null,
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
    const listing = await Product.findById(listingId).select('views clicks conversions');

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

    // Break down by conversion type
    const conversionBreakdown = {};
    let totalRevenue = 0;
    events
      .filter(e => e.eventType === 'conversion')
      .forEach(e => {
        conversionBreakdown[e.conversionType] = (conversionBreakdown[e.conversionType] || 0) + 1;
        totalRevenue += e.conversionValue || 0;
      });

    res.json({
      listing: {
        id: listing._id,
        views,
        clicks,
        conversions,
        ctr: parseFloat(ctr),
        conversionRate: parseFloat(conversionRate),
        revenue: totalRevenue
      },
      eventBreakdown: {
        views: events.filter(e => e.eventType === 'view').length,
        clicks: events.filter(e => e.eventType === 'click').length,
        conversions: events.filter(e => e.eventType === 'conversion').length
      },
      clickBreakdown,
      conversionBreakdown,
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
 * Get aggregate analytics across all listings (optionally filtered by type)
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
    const totalRevenue = events
      .filter(e => e.eventType === 'conversion')
      .reduce((sum, e) => sum + (e.conversionValue || 0), 0);

    res.json({
      summary: {
        totalViews,
        totalClicks,
        totalConversions,
        totalRevenue,
        overallCTR: totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0,
        conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : 0
      },
      byType: aggregateByType(events),
      topClickTypes: getTopClickTypes(events),
      topConversionTypes: getTopConversionTypes(events)
    });
  } catch (error) {
    console.error('Aggregate analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * Helper: Generate daily timeline
 */
function generateTimeline(events) {
  const timeline = {};
  events.forEach(event => {
    const date = new Date(event.timestamp).toLocaleDateString();
    if (!timeline[date]) {
      timeline[date] = { views: 0, clicks: 0, conversions: 0 };
    }
    if (event.eventType === 'view') timeline[date].views++;
    if (event.eventType === 'click') timeline[date].clicks++;
    if (event.eventType === 'conversion') timeline[date].conversions++;
  });
  return timeline;
}

/**
 * Helper: Aggregate by listing type
 */
function aggregateByType(events) {
  const byType = {
    product: { views: 0, clicks: 0, conversions: 0, revenue: 0 },
    tool: { views: 0, clicks: 0, conversions: 0, revenue: 0 },
    job: { views: 0, clicks: 0, conversions: 0, revenue: 0 }
  };

  events.forEach(event => {
    const type = event.listingType || 'product';
    if (byType[type]) {
      if (event.eventType === 'view') byType[type].views++;
      if (event.eventType === 'click') byType[type].clicks++;
      if (event.eventType === 'conversion') {
        byType[type].conversions++;
        byType[type].revenue += event.conversionValue || 0;
      }
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

/**
 * Helper: Get most common conversion types
 */
function getTopConversionTypes(events) {
  const conversionTypes = {};
  let conversionRevenue = {};
  
  events
    .filter(e => e.eventType === 'conversion')
    .forEach(e => {
      conversionTypes[e.conversionType] = (conversionTypes[e.conversionType] || 0) + 1;
      conversionRevenue[e.conversionType] = (conversionRevenue[e.conversionType] || 0) + (e.conversionValue || 0);
    });

  return Object.entries(conversionTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ 
      type, 
      count,
      revenue: conversionRevenue[type] || 0
    }));
}

module.exports = router;
