// Shared vocabularies. These mirror the values the existing CMS (procyonts.com/admin) writes,
// so both consoles can work on the same rows.

export const SUPABASE_URL = 'https://ozuqrpwhywdmcjohkxll.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_EC_AFs10_QT8zoh0z_jepA_xrSmVBeo';
export const MEDIA_BUCKET = 'blog-media';
export const SITE = 'https://procyonts.com';

export const LEAD_STATUSES = [
  { id: 'new', label: 'New', tone: 'blue' },
  { id: 'contacted', label: 'Contacted', tone: 'amber' },
  { id: 'qualified', label: 'Qualified', tone: 'violet' },
  { id: 'won', label: 'Won', tone: 'green' },
  { id: 'lost', label: 'Lost', tone: 'red' },
  { id: 'ignored', label: 'Ignored', tone: 'grey' }
];
export const OPEN_LEAD = (s) => !['won', 'lost', 'ignored'].includes(s);

// Service categories a sales rep can own (sales_categories.category); leads.category uses the same names.
export const LEAD_CATEGORIES = ['AI & Machine Learning', 'Cloud and Data', 'Salesforce', 'ServiceNow', 'Staff Augmentation',
  'Data Strategy & Analytics', 'Government Solutions', 'Others', 'Ignored'];

export const ACTIVITY_TYPES = {
  note: { label: 'Note', icon: 'note' },
  call: { label: 'Call', icon: 'phone' },
  email: { label: 'Email', icon: 'mail' },
  meeting: { label: 'Meeting', icon: 'meeting' },
  status_change: { label: 'Status change', icon: 'status' },
  assignment: { label: 'Assignment', icon: 'assign' }
};

export const MEETING_STATUSES = [
  { id: 'new', label: 'New', tone: 'blue' },
  { id: 'contacted', label: 'Contacted', tone: 'amber' },
  { id: 'confirmed', label: 'Confirmed', tone: 'violet' },
  { id: 'completed', label: 'Completed', tone: 'green' },
  { id: 'declined', label: 'Declined', tone: 'grey' }
];

export const APPLICATION_STATUSES = [
  { id: 'new', label: 'New', tone: 'blue' },
  { id: 'reviewed', label: 'Reviewed', tone: 'amber' },
  { id: 'shortlisted', label: 'Shortlisted', tone: 'green' },
  { id: 'rejected', label: 'Rejected', tone: 'grey' }
];
export const APPLICATION_NOTE_TYPES = {
  note: { label: 'Note', icon: 'note' },
  call: { label: 'Call', icon: 'phone' },
  interview: { label: 'Interview', icon: 'meeting' },
  role_transfer: { label: 'Role transfer', icon: 'move' }
};

export const ROLES = {
  admin: { label: 'Administrator', short: 'Admin', desc: 'Everything: CRM, content, promo bar, users and publishing.' },
  sales: { label: 'Sales', short: 'Sales', desc: 'Leads and event meeting requests.' },
  hr: { label: 'HR recruiter', short: 'HR', desc: 'Careers (job posts) and job applications.' }
};

export const statusOf = (list, id) => list.find(s => s.id === id) || { id, label: id || 'Unknown', tone: 'grey' };
