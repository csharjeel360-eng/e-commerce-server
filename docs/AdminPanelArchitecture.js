/**
 * ADMIN PANEL ARCHITECTURE
 * 
 * File: client/src/pages/admin/ListingManagement.jsx
 * 
 * Universal admin panel for managing:
 * - Software Tools (affiliate)
 * - Job Listings
 * - Physical/Digital Products (cart-enabled)
 */

/**
 * ============================================
 * CONDITIONAL FIELD STRATEGY
 * ============================================
 * 
 * 1. TYPE SELECTOR (Required)
 *    - Shows radio buttons: Product | Tool | Job
 *    - Triggers conditional field visibility
 * 
 * 2. COMMON FIELDS (All types)
 *    - Title, Slug, Description, Category
 *    - Images, Tags, Status
 * 
 * 3. CONDITIONAL FIELDS
 * 
 *    TYPE: PRODUCT
 *    ├─ Price & Pricing Type
 *    ├─ Stock Management
 *    ├─ Cart Enabled Toggle
 *    └─ No affiliateLink required
 * 
 *    TYPE: TOOL
 *    ├─ External Link (affiliate URL) [REQUIRED]
 *    ├─ Pricing Type (free/paid/freemium)
 *    ├─ Platform Checkboxes (web, windows, mac, etc.)
 *    ├─ Features List
 *    ├─ Integrations List
 *    ├─ Affiliate Source dropdown
 *    ├─ Affiliate ID field
 *    └─ No price/stock fields
 * 
 *    TYPE: JOB
 *    ├─ External Link (application URL) [REQUIRED]
 *    ├─ Company Name
 *    ├─ Job Type (full-time, part-time, etc.)
 *    ├─ Location
 *    ├─ Salary Range
 *    ├─ Experience Level
 *    ├─ Application Deadline
 *    └─ No price/stock, no cart
 */

// ============================================
// ADMIN FORM COMPONENTS
// ============================================

/**
 * STEP 1: Listing Type Selector
 * 
 * Rendered at form top, determines visible fields
 */
const ListingTypeSelector = ({ value, onChange }) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Listing Type</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { value: 'product', label: 'Product', desc: 'With cart & checkout' },
          { value: 'tool', label: 'Software Tool', desc: 'Affiliate link' },
          { value: 'job', label: 'Job Opening', desc: 'Apply directly' }
        ].map(option => (
          <label key={option.value} className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all"
            style={{
              borderColor: value === option.value ? '#3b82f6' : '#e5e7eb',
              backgroundColor: value === option.value ? '#eff6ff' : 'white'
            }}>
            <input
              type="radio"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="w-5 h-5"
            />
            <div>
              <div className="font-semibold text-gray-900">{option.label}</div>
              <div className="text-sm text-gray-600">{option.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

/**
 * STEP 2: Common Fields
 * 
 * All listing types must have these
 */
const CommonFields = ({ formData, onChange, onImageUpload }) => {
  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Basic Information</h3>
      
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 'Figma Pro', 'Senior React Developer', 'Wireless Headphones'"
          maxLength={100}
        />
        <p className="text-xs text-gray-500 mt-1">{formData.title.length}/100</p>
      </div>

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Slug (auto-generated)</label>
        <input
          type="text"
          value={formData.slug}
          disabled
          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
        <textarea
          value={formData.description}
          onChange={(e) => onChange('description', e.target.value)}
          rows="6"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Detailed description of the listing..."
          maxLength={2000}
        />
        <p className="text-xs text-gray-500 mt-1">{formData.description.length}/2000</p>
      </div>

      {/* Images */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <button
            type="button"
            onClick={() => document.getElementById('imageInput').click()}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Upload Image
          </button>
          <input
            id="imageInput"
            type="file"
            multiple
            hidden
            onChange={onImageUpload}
            accept="image/*"
          />
        </div>
        {/* Image preview grid */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          {formData.images?.map((img, i) => (
            <div key={i} className="relative">
              <img src={img.url} alt="preview" className="w-full h-24 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => onChange('images', formData.images.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full hover:bg-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
        <select
          value={formData.category}
          onChange={(e) => onChange('category', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Category</option>
          {/* Fetch from API */}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
        <input
          type="text"
          value={formData.tags?.join(', ')}
          onChange={(e) => onChange('tags', e.target.value.split(',').map(t => t.trim()))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Separate with commas"
        />
      </div>
    </div>
  );
};

/**
 * STEP 3: Product-Specific Fields
 * 
 * Only shown when type === 'product'
 */
const ProductFields = ({ formData, onChange }) => {
  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Product Information</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Price *</label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) => onChange('price', parseFloat(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
            step="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Original Price</label>
          <input
            type="number"
            value={formData.originalPrice}
            onChange={(e) => onChange('originalPrice', parseFloat(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
            step="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Stock *</label>
          <input
            type="number"
            value={formData.stock}
            onChange={(e) => onChange('stock', parseInt(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cart Enabled</label>
          <input
            type="checkbox"
            checked={formData.cartEnabled}
            onChange={(e) => onChange('cartEnabled', e.target.checked)}
            className="w-5 h-5"
          />
        </div>
      </div>
    </div>
  );
};

/**
 * STEP 4: Tool-Specific Fields
 * 
 * Only shown when type === 'tool'
 */
const ToolFields = ({ formData, onChange }) => {
  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-green-200 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center gap-2">
        🔧 Software Tool Fields
      </h3>

      {/* External Link (REQUIRED for tools) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          External Link (Affiliate URL) *
        </label>
        <input
          type="url"
          value={formData.externalLink}
          onChange={(e) => onChange('externalLink', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          placeholder="https://example.com/?ref=..."
          required
        />
        <p className="text-xs text-gray-600 mt-1">
          💡 Paste your affiliate/referral link here. It opens in a new tab.
        </p>
      </div>

      {/* Pricing Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Pricing Type</label>
        <select
          value={formData.pricingType}
          onChange={(e) => onChange('pricingType', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
        >
          <option value="free">Free</option>
          <option value="paid">Paid</option>
          <option value="freemium">Freemium (Free + Paid Tiers)</option>
        </select>
      </div>

      {/* Platform */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
        <div className="space-y-2">
          {['web', 'windows', 'macos', 'ios', 'android', 'linux'].map(platform => (
            <label key={platform} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.platform?.includes(platform)}
                onChange={(e) => {
                  const updated = e.target.checked
                    ? [...(formData.platform || []), platform]
                    : (formData.platform || []).filter(p => p !== platform);
                  onChange('platform', updated);
                }}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700 capitalize">{platform}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Features */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Key Features</label>
        <div className="space-y-2">
          {(formData.features || []).map((feature, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={feature}
                onChange={(e) => {
                  const updated = [...formData.features];
                  updated[i] = e.target.value;
                  onChange('features', updated);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., 'AI-powered recommendations'"
              />
              <button
                type="button"
                onClick={() => onChange('features', formData.features.filter((_, idx) => idx !== i))}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange('features', [...(formData.features || []), ''])}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Add Feature
          </button>
        </div>
      </div>

      {/* Affiliate Source */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Affiliate Source</label>
          <select
            value={formData.affiliateSource}
            onChange={(e) => onChange('affiliateSource', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select Source</option>
            <option value="producthunt">Product Hunt</option>
            <option value="appsumo">AppSumo</option>
            <option value="capterra">Capterra</option>
            <option value="company_website">Company Website</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Affiliate ID</label>
          <input
            type="text"
            value={formData.affiliateId}
            onChange={(e) => onChange('affiliateId', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            placeholder="Optional tracking ID"
          />
        </div>
      </div>
    </div>
  );
};

/**
 * STEP 5: Job-Specific Fields
 * 
 * Only shown when type === 'job'
 */
const JobFields = ({ formData, onChange }) => {
  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-purple-200 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 flex items-center gap-2">
        💼 Job Listing Fields
      </h3>

      {/* Company Name (REQUIRED for jobs) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
        <input
          type="text"
          value={formData.companyName}
          onChange={(e) => onChange('companyName', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          placeholder="e.g., 'Google', 'Startup Inc.'"
          required
        />
      </div>

      {/* External Link (REQUIRED for jobs) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Application URL (Apply Link) *
        </label>
        <input
          type="url"
          value={formData.externalLink}
          onChange={(e) => onChange('externalLink', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          placeholder="https://company.careers/..."
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Job Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Job Type *</label>
          <select
            value={formData.jobType}
            onChange={(e) => onChange('jobType', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            required
          >
            <option value="">Select Type</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="freelance">Freelance</option>
            <option value="internship">Internship</option>
          </select>
        </div>

        {/* Experience Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Experience Level</label>
          <select
            value={formData.experienceLevel}
            onChange={(e) => onChange('experienceLevel', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="any">Any Level</option>
            <option value="entry">Entry Level</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => onChange('location', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., 'San Francisco, CA' or 'Remote'"
          />
        </div>

        {/* Salary */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Salary Range</label>
          <input
            type="text"
            value={formData.salary}
            onChange={(e) => onChange('salary', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            placeholder="e.g., '$80k - $120k' or 'Competitive'"
          />
        </div>
      </div>

      {/* Application Deadline */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Application Deadline</label>
        <input
          type="date"
          value={formData.applicationDeadline}
          onChange={(e) => onChange('applicationDeadline', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Required Skills (uses Tags) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>
        <input
          type="text"
          value={formData.tags?.join(', ')}
          onChange={(e) => onChange('tags', e.target.value.split(',').map(t => t.trim()))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          placeholder="React, Node.js, PostgreSQL, etc."
        />
      </div>
    </div>
  );
};

/**
 * STEP 6: Publishing & Featured Options
 * 
 * All types
 */
const PublishingOptions = ({ formData, onChange }) => {
  return (
    <div className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Publishing</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={formData.status}
            onChange={(e) => onChange('status', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isFeatured}
              onChange={(e) => onChange('isFeatured', e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-medium text-gray-700">⭐ Featured</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => onChange('isActive', e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>
      </div>

      {/* SEO Fields */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">SEO Settings</h4>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Meta Title</label>
            <input
              type="text"
              value={formData.metaTitle}
              onChange={(e) => onChange('metaTitle', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="Page title for search engines"
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Meta Description</label>
            <textarea
              value={formData.metaDescription}
              onChange={(e) => onChange('metaDescription', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
              rows="2"
              placeholder="Description for search engines"
              maxLength={160}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ANALYTICS DASHBOARD
// ============================================

/**
 * File: client/src/pages/admin/ListingAnalytics.jsx
 * 
 * Show aggregated views, clicks, and conversions
 */
const ListingAnalyticsDashboard = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Listing Analytics</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-gray-600 text-sm font-medium">Total Listings</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">147</div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-gray-600 text-sm font-medium">Total Views</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">12,540</div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-gray-600 text-sm font-medium">Affiliate Clicks</div>
          <div className="text-3xl font-bold text-green-600 mt-2">2,384</div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-gray-600 text-sm font-medium">Conversion Rate</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">19%</div>
        </div>
      </div>

      {/* Table: Top Performing Listings */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">Title</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">Type</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">Views</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">Clicks</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">CTR %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">Figma Pro</td>
                <td className="px-6 py-4"><span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Tool</span></td>
                <td className="px-6 py-4">2,450</td>
                <td className="px-6 py-4">485</td>
                <td className="px-6 py-4"><span className="text-green-600 font-semibold">19.8%</span></td>
              </tr>
              {/* More rows */}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdown by Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4">By Type</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Products</span>
                <span className="font-semibold">42</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '28%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Tools</span>
                <span className="font-semibold">65</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: '44%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Jobs</span>
                <span className="font-semibold">40</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: '27%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

module.exports = {
  ListingTypeSelector,
  CommonFields,
  ProductFields,
  ToolFields,
  JobFields,
  PublishingOptions,
  ListingAnalyticsDashboard
};
