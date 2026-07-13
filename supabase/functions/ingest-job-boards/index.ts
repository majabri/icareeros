// supabase/functions/ingest-job-boards/index.ts
//
// Multi-ATS Job Scraping Service for iCareerOS.
// Supports Greenhouse, Lever, Ashby with intelligent parsing.
//
// Source: archive/code-retired-2026-05-09/job-quality/scrape-jobs-ats-function.ts
// (originally authored 2026-05-05 — "Job Discovery & Anti-Fraud" implementation).
// Renamed from `scrape-jobs-ats` to `ingest-job-boards` per the prelaunch master
// brief (W5-C). Backed by migration `job_search_quality_v1` (2026-05-09).
//
// Deployed verbatim except for this provenance header AND a one-line fix on the
// `career_page` fallback path: `Buffer.from(...)` (Node-only) is now wrapped in a
// `typeof Buffer !== 'undefined' ? Buffer.from(...) : btoa(...)` so the Deno
// runtime can execute it. All other ATS paths (Greenhouse/Lever/Ashby/Workday)
// were untouched.
//

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ATSScrapingRequest {
  companies: CompanyConfig[];
  max_jobs_per_company?: number;
  skills_filter?: string[];
  location_filter?: string[];
  employment_types?: ('full_time' | 'part_time' | 'contract' | 'internship')[];
  posted_since_days?: number;
}

interface CompanyConfig {
  slug: string;                    // e.g., "stripe", "notion"
  ats_type: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'career_page';
  career_url?: string;             // Override URL if needed
  priority: number;                // 1-10, higher = process first
}

interface ScrapedJob {
  source_id: string;              // e.g., "gh-stripe-engineer-123"
  title: string;
  company: string;
  description: string;
  location: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
  benefits?: string;
  requirements?: string;
  employment_type: string;
  posted_at: string;
  apply_url: string;
  source: string;                 // 'greenhouse', 'lever', etc.
  source_url: string;
  department?: string;
  remote_ok: boolean;
  raw_data: any;
}

interface ScrapingResponse {
  success: boolean;
  total_jobs_found: number;
  jobs_scraped: number;
  companies_processed: number;
  companies_failed: string[];
  processing_time_ms: number;
  jobs: ScrapedJob[];
  errors?: any[];
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      companies,
      max_jobs_per_company = 50,
      skills_filter = [],
      location_filter = [],
      employment_types = [],
      posted_since_days = 30
    }: ATSScrapingRequest = await req.json();

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: 'companies array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting ATS scraping for ${companies.length} companies`);
    const startTime = Date.now();

    // Sort by priority and process
    const sortedCompanies = companies.sort((a, b) => b.priority - a.priority);
    const results: ScrapedJob[] = [];
    const errors: any[] = [];
    const failedCompanies: string[] = [];
    let companiesProcessed = 0;

    for (const company of sortedCompanies) {
      try {
        console.log(`Scraping ${company.slug} (${company.ats_type})`);
        
        const jobs = await scrapeCompanyJobs(company, {
          max_jobs: max_jobs_per_company,
          skills_filter,
          location_filter,
          employment_types,
          posted_since_days
        });

        results.push(...jobs);
        companiesProcessed++;
        
        console.log(`${company.slug}: Found ${jobs.length} jobs`);
        
        // Rate limiting between companies
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to scrape ${company.slug}:`, error);
        failedCompanies.push(company.slug);
        errors.push({
          company: company.slug,
          error: (error as Error)?.message ?? String(error)
        });
      }
    }

    const response: ScrapingResponse = {
      success: true,
      total_jobs_found: results.length,
      jobs_scraped: results.length,
      companies_processed: companiesProcessed,
      companies_failed: failedCompanies,
      processing_time_ms: Date.now() - startTime,
      jobs: results,
      errors: errors.length > 0 ? errors : undefined
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ATS scraping error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        total_jobs_found: 0,
        jobs_scraped: 0,
        companies_processed: 0,
        companies_failed: [],
        processing_time_ms: 0,
        jobs: [],
        error: (error as Error)?.message ?? String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function scrapeCompanyJobs(
  company: CompanyConfig,
  filters: {
    max_jobs: number;
    skills_filter: string[];
    location_filter: string[];
    employment_types: string[];
    posted_since_days: number;
  }
): Promise<ScrapedJob[]> {
  
  switch (company.ats_type) {
    case 'greenhouse':
      return await scrapeGreenhouse(company, filters);
    case 'lever':
      return await scrapeLever(company, filters);
    case 'ashby':
      return await scrapeAshby(company, filters);
    case 'workday':
      return await scrapeWorkday(company, filters);
    case 'career_page':
      return await scrapeCareerPage(company, filters);
    default:
      throw new Error(`Unsupported ATS type: ${company.ats_type}`);
  }
}

async function scrapeGreenhouse(
  company: CompanyConfig,
  filters: any
): Promise<ScrapedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'iCareerOS/1.0 (Job Discovery Bot)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Greenhouse API error: ${response.status}`);
    }

    const data = await response.json();
    const jobs: ScrapedJob[] = [];

    for (const job of data.jobs || []) {
      // Apply filters
      if (!passesFilters(job, filters)) continue;
      
      // Parse Greenhouse job structure
      const parsedJob: ScrapedJob = {
        source_id: `gh-${company.slug}-${job.id}`,
        title: job.title || 'Untitled',
        company: company.slug,
        description: extractJobDescription(job.content || ''),
        location: parseLocation(job.location),
        salary_min: extractSalary(job.content, 'min'),
        salary_max: extractSalary(job.content, 'max'),
        currency: 'USD', // Default, could be parsed
        benefits: extractBenefits(job.content),
        requirements: extractRequirements(job.content),
        employment_type: parseEmploymentType(job.title, job.content),
        posted_at: job.updated_at || new Date().toISOString(),
        apply_url: job.absolute_url,
        source: 'greenhouse',
        source_url: job.absolute_url,
        department: job.departments?.[0]?.name,
        remote_ok: isRemoteRole(job.location, job.content),
        raw_data: job
      };

      jobs.push(parsedJob);
      
      if (jobs.length >= filters.max_jobs) break;
    }

    return jobs;

  } catch (error) {
    console.error(`Greenhouse scraping failed for ${company.slug}:`, error);
    throw error;
  }
}

async function scrapeLever(
  company: CompanyConfig,
  filters: any
): Promise<ScrapedJob[]> {
  const url = `https://api.lever.co/v0/postings/${company.slug}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'iCareerOS/1.0 (Job Discovery Bot)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Lever API error: ${response.status}`);
    }

    const data = await response.json();
    const jobs: ScrapedJob[] = [];

    for (const job of data || []) {
      if (!passesFilters(job, filters)) continue;
      
      const parsedJob: ScrapedJob = {
        source_id: `lv-${company.slug}-${job.id}`,
        title: job.text || 'Untitled',
        company: company.slug,
        description: job.description || job.descriptionPlain || '',
        location: parseLocation(job.categories?.location),
        salary_min: job.salaryMin,
        salary_max: job.salaryMax,
        currency: job.salaryCurrency || 'USD',
        benefits: extractBenefits(job.description),
        requirements: job.lists?.find((l: any) => l.text.includes('requirement'))?.content,
        employment_type: parseEmploymentType(job.text, job.description),
        posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
        apply_url: job.applyUrl || job.hostedUrl,
        source: 'lever',
        source_url: job.hostedUrl,
        department: job.categories?.department,
        remote_ok: isRemoteRole(job.categories?.location, job.description),
        raw_data: job
      };

      jobs.push(parsedJob);
      
      if (jobs.length >= filters.max_jobs) break;
    }

    return jobs;

  } catch (error) {
    console.error(`Lever scraping failed for ${company.slug}:`, error);
    throw error;
  }
}

async function scrapeAshby(
  company: CompanyConfig,
  filters: any
): Promise<ScrapedJob[]> {
  const url = `https://jobs.ashbyhq.com/${company.slug}`;
  
  try {
    // Ashby typically requires HTML parsing as they don't always have public APIs
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; iCareerOS/1.0; Job Discovery Bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`Ashby page error: ${response.status}`);
    }

    const html = await response.text();
    
    // Look for JSON data in script tags (common Ashby pattern)
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
    
    if (!jsonMatch) {
      throw new Error('No Ashby job data found in page');
    }

    const initialState = JSON.parse(jsonMatch[1]);
    const jobsData = initialState?.jobs?.jobs || [];
    const jobs: ScrapedJob[] = [];

    for (const job of jobsData) {
      if (!passesFilters(job, filters)) continue;
      
      const parsedJob: ScrapedJob = {
        source_id: `ash-${company.slug}-${job.id}`,
        title: job.title || 'Untitled',
        company: company.slug,
        description: job.descriptionHtml || job.description || '',
        location: parseLocation(job.location),
        salary_min: job.compensationMin,
        salary_max: job.compensationMax,
        currency: job.compensationCurrency || 'USD',
        benefits: extractBenefits(job.descriptionHtml),
        requirements: extractRequirements(job.descriptionHtml),
        employment_type: parseEmploymentType(job.title, job.descriptionHtml),
        posted_at: job.publishedAt ? new Date(job.publishedAt).toISOString() : new Date().toISOString(),
        apply_url: `https://jobs.ashbyhq.com/${company.slug}/${job.id}`,
        source: 'ashby',
        source_url: `https://jobs.ashbyhq.com/${company.slug}/${job.id}`,
        department: job.department?.title,
        remote_ok: isRemoteRole(job.location, job.descriptionHtml),
        raw_data: job
      };

      jobs.push(parsedJob);
      
      if (jobs.length >= filters.max_jobs) break;
    }

    return jobs;

  } catch (error) {
    console.error(`Ashby scraping failed for ${company.slug}:`, error);
    throw error;
  }
}

async function scrapeWorkday(
  company: CompanyConfig,
  filters: any
): Promise<ScrapedJob[]> {
  // Workday scraping is more complex due to their dynamic URLs
  // This is a simplified implementation - production would need more robust handling
  
  const baseUrl = company.career_url || `https://${company.slug}.wd1.myworkdayjobs.com`;
  
  try {
    // Workday often requires POST requests to their search API
    const searchUrl = `${baseUrl}/wday/cxs/${company.slug}/jobs`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'iCareerOS/1.0 (Job Discovery Bot)'
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: filters.max_jobs,
        offset: 0,
        searchText: ""
      })
    });

    if (!response.ok) {
      throw new Error(`Workday API error: ${response.status}`);
    }

    const data = await response.json();
    const jobs: ScrapedJob[] = [];

    for (const job of data.jobPostings || []) {
      if (!passesFilters(job, filters)) continue;
      
      const parsedJob: ScrapedJob = {
        source_id: `wd-${company.slug}-${job.bulletFields[0]}`,
        title: job.title || 'Untitled',
        company: company.slug,
        description: job.jobDescription || '',
        location: parseLocation(job.locationsText),
        employment_type: parseEmploymentType(job.title, job.jobDescription),
        posted_at: job.postedOn ? new Date(job.postedOn).toISOString() : new Date().toISOString(),
        apply_url: `${baseUrl}${job.externalPath}`,
        source: 'workday',
        source_url: `${baseUrl}${job.externalPath}`,
        remote_ok: isRemoteRole(job.locationsText, job.jobDescription),
        raw_data: job
      };

      jobs.push(parsedJob);
    }

    return jobs;

  } catch (error) {
    console.error(`Workday scraping failed for ${company.slug}:`, error);
    throw error;
  }
}

async function scrapeCareerPage(
  company: CompanyConfig,
  filters: any
): Promise<ScrapedJob[]> {
  // Generic career page scraping using regex patterns
  const url = company.career_url || `https://${company.slug}.com/careers`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; iCareerOS/1.0; Job Discovery Bot)'
      }
    });

    if (!response.ok) {
      throw new Error(`Career page error: ${response.status}`);
    }

    const html = await response.text();
    
    // Extract job links using common patterns
    const jobLinkPatterns = [
      /href="([^"]*(?:job|career|position)[^"]*)"[^>]*>([^<]+)</gi,
      /href="([^"]*\/jobs\/[^"]*)"[^>]*>([^<]+)</gi,
    ];

    const jobs: ScrapedJob[] = [];
    
    for (const pattern of jobLinkPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && jobs.length < filters.max_jobs) {
        const [, jobUrl, jobTitle] = match;
        
        try {
          // Fetch individual job page
          const fullJobUrl = jobUrl.startsWith('http') ? jobUrl : `https://${company.slug}.com${jobUrl}`;
          const jobResponse = await fetch(fullJobUrl);
          
          if (jobResponse.ok) {
            const jobHtml = await jobResponse.text();
            
            const parsedJob: ScrapedJob = {
              source_id: `cp-${company.slug}-${(typeof Buffer !== 'undefined' ? Buffer.from(jobUrl).toString('base64') : btoa(jobUrl)).slice(0, 10)}`,
              title: jobTitle.trim(),
              company: company.slug,
              description: extractJobDescriptionFromHTML(jobHtml),
              location: extractLocationFromHTML(jobHtml),
              employment_type: 'full_time', // Default
              posted_at: new Date().toISOString(),
              apply_url: fullJobUrl,
              source: 'career_page',
              source_url: fullJobUrl,
              remote_ok: isRemoteRole('', jobHtml),
              raw_data: { html: jobHtml.slice(0, 1000) } // Truncated
            };

            jobs.push(parsedJob);
          }
          
          // Rate limit between individual job page requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.warn(`Failed to fetch job page ${jobUrl}:`, error);
        }
      }
    }

    return jobs;

  } catch (error) {
    console.error(`Career page scraping failed for ${company.slug}:`, error);
    throw error;
  }
}

// Helper functions for parsing job data

function passesFilters(job: any, filters: any): boolean {
  // Posted date filter
  if (filters.posted_since_days) {
    const cutoffDate = new Date(Date.now() - filters.posted_since_days * 24 * 60 * 60 * 1000);
    const jobDate = new Date(job.createdAt || job.updatedAt || job.posted_at || Date.now());
    if (jobDate < cutoffDate) return false;
  }

  // Skills filter
  if (filters.skills_filter.length > 0) {
    const jobText = `${job.title} ${job.description || job.content || ''}`.toLowerCase();
    const hasRequiredSkill = filters.skills_filter.some((skill: string) =>
      jobText.includes(skill.toLowerCase())
    );
    if (!hasRequiredSkill) return false;
  }

  // Location filter
  if (filters.location_filter.length > 0) {
    const jobLocation = (job.location || job.categories?.location || '').toLowerCase();
    const matchesLocation = filters.location_filter.some((loc: string) =>
      jobLocation.includes(loc.toLowerCase())
    );
    if (!matchesLocation && !isRemoteRole(jobLocation, job.description || '')) return false;
  }

  return true;
}

function extractJobDescription(content: string): string {
  // Remove HTML tags and extract meaningful text
  return content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000); // Limit description length
}

function extractJobDescriptionFromHTML(html: string): string {
  // More sophisticated HTML parsing for career pages
  const descriptionPatterns = [
    /<div[^>]*(?:class|id)="[^"]*(?:description|content|job-description)[^"]*"[^>]*>(.*?)<\/div>/is,
    /<section[^>]*(?:class|id)="[^"]*(?:description|content)[^"]*"[^>]*>(.*?)<\/section>/is,
    /<p[^>]*>(.*?)<\/p>/gis
  ];

  for (const pattern of descriptionPatterns) {
    const match = pattern.exec(html);
    if (match) {
      return extractJobDescription(match[1]);
    }
  }

  return '';
}

function parseLocation(location: any): string {
  if (!location) return '';
  
  if (typeof location === 'string') {
    return location;
  }
  
  if (typeof location === 'object') {
    return location.name || location.title || location.city || '';
  }
  
  return '';
}

function extractLocationFromHTML(html: string): string {
  const locationPatterns = [
    /<span[^>]*(?:class|id)="[^"]*location[^"]*"[^>]*>([^<]+)<\/span>/i,
    /Location[:\s]*([^<\n]+)/i,
    /Based in[:\s]*([^<\n]+)/i
  ];

  for (const pattern of locationPatterns) {
    const match = pattern.exec(html);
    if (match) {
      return match[1].trim();
    }
  }

  return '';
}

function extractSalary(content: string, type: 'min' | 'max'): number | undefined {
  const salaryPattern = /\$?([\d,]+)\s*(?:k|000)?\s*[-–]\s*\$?([\d,]+)\s*(?:k|000)?/i;
  const match = salaryPattern.exec(content);
  
  if (match) {
    const min = parseInt(match[1].replace(/,/g, ''));
    const max = parseInt(match[2].replace(/,/g, ''));
    
    return type === 'min' ? min : max;
  }
  
  return undefined;
}

function extractBenefits(content: string): string {
  const benefitKeywords = ['benefit', 'insurance', 'health', 'dental', 'vision', '401k', 'pto', 'vacation'];
  const sentences = content.split(/[.!?]+/);
  
  const benefitSentences = sentences.filter(sentence =>
    benefitKeywords.some(keyword =>
      sentence.toLowerCase().includes(keyword)
    )
  );

  return benefitSentences.join('. ').slice(0, 500);
}

function extractRequirements(content: string): string {
  const reqPatterns = [
    /(?:Requirements|Required|Must have|Qualifications)[:\s]*(.*?)(?:\n\n|Requirements|Qualifications|$)/is,
    /(?:You should have|We're looking for)[:\s]*(.*?)(?:\n\n|$)/is
  ];

  for (const pattern of reqPatterns) {
    const match = pattern.exec(content);
    if (match) {
      return match[1].trim().slice(0, 1000);
    }
  }

  return '';
}

function parseEmploymentType(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('intern')) return 'internship';
  if (text.includes('contract') || text.includes('freelance')) return 'contract';
  if (text.includes('part-time') || text.includes('part time')) return 'part_time';
  
  return 'full_time';
}

function isRemoteRole(location: string, description: string): boolean {
  const text = `${location} ${description}`.toLowerCase();
  return text.includes('remote') || 
         text.includes('work from home') || 
         text.includes('distributed') ||
         text.includes('anywhere');
}
