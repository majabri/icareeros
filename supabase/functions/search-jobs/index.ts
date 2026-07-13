// supabase/functions/search-jobs/index.ts
//
// AI-Powered Job Search using Perplexity Sonar for iCareerOS.
// Finds live job listings with structured extraction and verification.
//
// Source: archive/code-retired-2026-05-09/job-quality/search-jobs-ai-function.ts
// (originally authored 2026-05-05 — "Job Discovery & Anti-Fraud" implementation).
// Backed by migration `job_search_quality_v1` (2026-05-09): job_quality_scores,
// company_validations, job_quality_feedback.
//
// Deployed verbatim except for this provenance header.
//

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AISearchRequest {
  query: string;                   // "Senior React developer remote"
  location?: string;               // "San Francisco" or "Remote"
  skills?: string[];              // ["React", "TypeScript", "Node.js"]
  career_level?: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  salary_range?: {
    min: number;
    max: number;
  };
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship';
  company_size?: 'startup' | 'medium' | 'enterprise';
  max_results?: number;           // Default: 10
  include_citations?: boolean;    // Default: true
}

interface AIJobResult {
  source_id: string;              // Generated from URL hash
  title: string;
  company: string;
  description: string;
  location: string;
  salary_estimate?: {
    min?: number;
    max?: number;
    currency: string;
  };
  employment_type: string;
  posted_date?: string;
  apply_url: string;
  source: 'ai_search';
  source_platform: string;       // "LinkedIn", "Indeed", "AngelList", etc.
  ai_confidence: number;          // 0-1
  citations: string[];           // URLs where this job was found
  extracted_skills: string[];
  raw_search_result: any;
}

interface AISearchResponse {
  success: boolean;
  query_processed: string;
  jobs_found: number;
  search_confidence: number;
  processing_time_ms: number;
  jobs: AIJobResult[];
  search_metadata: {
    perplexity_model: string;
    search_strategy: string;
    filters_applied: any;
  };
  error?: string;
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

    const searchRequest: AISearchRequest = await req.json();

    if (!searchRequest.query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`AI job search: "${searchRequest.query}"`);
    const startTime = Date.now();

    // Build enhanced search query
    const enhancedQuery = buildSearchQuery(searchRequest);
    console.log(`Enhanced search query: ${enhancedQuery}`);

    // Execute AI-powered search
    const searchResults = await executePerplexitySearch(enhancedQuery, searchRequest);

    // Parse and structure the results
    const structuredJobs = await parseJobResults(searchResults, searchRequest);

    // Filter and rank results
    const filteredJobs = filterAndRankResults(structuredJobs, searchRequest);

    const response: AISearchResponse = {
      success: true,
      query_processed: enhancedQuery,
      jobs_found: filteredJobs.length,
      search_confidence: calculateSearchConfidence(filteredJobs),
      processing_time_ms: Date.now() - startTime,
      jobs: filteredJobs,
      search_metadata: {
        perplexity_model: 'llama-3.1-sonar-large-128k-online',
        search_strategy: 'structured_extraction',
        filters_applied: {
          location: searchRequest.location,
          career_level: searchRequest.career_level,
          employment_type: searchRequest.employment_type,
          max_results: searchRequest.max_results || 10
        }
      }
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI search error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        query_processed: '',
        jobs_found: 0,
        search_confidence: 0,
        processing_time_ms: 0,
        jobs: [],
        search_metadata: {},
        error: (error as Error)?.message ?? String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildSearchQuery(request: AISearchRequest): string {
  let query = request.query;

  // Add location filter
  if (request.location) {
    query += ` location:${request.location}`;
  }

  // Add career level context
  if (request.career_level) {
    query += ` ${request.career_level} level`;
  }

  // Add employment type
  if (request.employment_type) {
    const typeMap = {
      'full_time': 'full-time',
      'part_time': 'part-time',
      'contract': 'contract',
      'internship': 'internship'
    };
    query += ` ${typeMap[request.employment_type]}`;
  }

  // Add skills context
  if (request.skills && request.skills.length > 0) {
    query += ` skills: ${request.skills.join(', ')}`;
  }

  // Add salary context
  if (request.salary_range) {
    query += ` salary $${request.salary_range.min}k-$${request.salary_range.max}k`;
  }

  // Add current job search context
  query += ' current job openings 2026';

  return query;
}

async function executePerplexitySearch(query: string, request: AISearchRequest): Promise<any> {
  const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
  
  if (!perplexityApiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const maxResults = request.max_results || 10;

  const systemPrompt = `You are a job search expert. Your task is to find ${maxResults} current job openings that match the user's criteria. 

For each job you find, extract the following information in JSON format:
- title: Job title
- company: Company name  
- location: Job location (city/state or "Remote")
- description: Brief job description (100-200 words)
- salary_range: If mentioned, extract min/max salary
- employment_type: full_time, part_time, contract, or internship
- posted_date: When the job was posted (if available)
- apply_url: Direct link to apply
- source_platform: Which platform (LinkedIn, Indeed, AngelList, etc.)
- skills_required: List of key skills mentioned
- confidence: Your confidence this is a real, current job opening (0.0-1.0)

Focus on finding actual job postings, not job search tips or general career advice. Only include jobs posted within the last 30 days. Prioritize direct employer postings over recruiter posts when possible.

Return the results as a JSON array of job objects.`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Find current job openings: ${query}`
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
      return_citations: request.include_citations !== false,
      search_domain_filter: ['linkedin.com', 'indeed.com', 'glassdoor.com', 'angellist.com', 'jobs.com']
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0]) {
    throw new Error('No search results returned from Perplexity');
  }

  return data;
}

async function parseJobResults(searchResults: any, request: AISearchRequest): Promise<AIJobResult[]> {
  const messageContent = searchResults.choices[0].message.content;
  const citations = searchResults.citations || [];

  // Extract JSON from the AI response
  let jobsJson;
  try {
    // Look for JSON array in the response
    const jsonMatch = messageContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jobsJson = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: try to parse the entire response
      jobsJson = JSON.parse(messageContent);
    }
  } catch (error) {
    console.warn('Failed to parse AI response as JSON:', error);
    
    // Fallback: extract jobs using regex patterns
    return extractJobsFromText(messageContent, citations);
  }

  if (!Array.isArray(jobsJson)) {
    throw new Error('AI response is not a valid job array');
  }

  const jobs: AIJobResult[] = [];

  for (const jobData of jobsJson) {
    try {
      // Generate source_id from company and title
      const sourceId = generateSourceId(jobData.company, jobData.title);
      
      const job: AIJobResult = {
        source_id: sourceId,
        title: jobData.title || 'Untitled',
        company: jobData.company || 'Unknown Company',
        description: jobData.description || '',
        location: jobData.location || '',
        salary_estimate: jobData.salary_range ? {
          min: jobData.salary_range.min,
          max: jobData.salary_range.max,
          currency: 'USD'
        } : undefined,
        employment_type: jobData.employment_type || 'full_time',
        posted_date: jobData.posted_date,
        apply_url: jobData.apply_url || '',
        source: 'ai_search',
        source_platform: jobData.source_platform || 'Unknown',
        ai_confidence: jobData.confidence || 0.7,
        citations: filterRelevantCitations(citations, jobData),
        extracted_skills: Array.isArray(jobData.skills_required) ? jobData.skills_required : [],
        raw_search_result: jobData
      };

      // Basic validation
      if (job.title && job.company && job.apply_url) {
        jobs.push(job);
      } else {
        console.warn('Skipping invalid job result:', jobData);
      }

    } catch (error) {
      console.warn('Failed to parse job result:', error, jobData);
    }
  }

  return jobs;
}

function extractJobsFromText(text: string, citations: string[]): AIJobResult[] {
  // Fallback extraction using regex patterns
  const jobs: AIJobResult[] = [];
  
  // Look for job-like patterns in the text
  const jobPatterns = [
    /(?:Job Title|Position|Role):\s*([^\n]+)\s*(?:Company|Employer):\s*([^\n]+)/gi,
    /([^\n]+)\s+at\s+([^\n]+)\s*(?:\n|$)/gi
  ];

  for (const pattern of jobPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, title, company] = match;
      
      if (title && company) {
        jobs.push({
          source_id: generateSourceId(company, title),
          title: title.trim(),
          company: company.trim(),
          description: 'Job found via AI search - details may be limited',
          location: '',
          employment_type: 'full_time',
          apply_url: '',
          source: 'ai_search',
          source_platform: 'Mixed',
          ai_confidence: 0.5,
          citations: citations,
          extracted_skills: [],
          raw_search_result: { text_match: match[0] }
        });
      }
    }
  }

  return jobs.slice(0, 5); // Limit fallback results
}

function generateSourceId(company: string, title: string): string {
  // Create a consistent source ID from company and title
  const input = `${company.toLowerCase()}-${title.toLowerCase()}`;
  const hash = input.replace(/[^a-z0-9]/g, '').slice(0, 20);
  return `ai-${hash}-${Date.now().toString(36)}`;
}

function filterRelevantCitations(citations: string[], jobData: any): string[] {
  // Try to match citations to specific job
  if (!citations || citations.length === 0) return [];

  // Look for citations that might be related to this specific job
  const relevantCitations = citations.filter(citation => {
    const lowerCitation = citation.toLowerCase();
    const company = (jobData.company || '').toLowerCase();
    
    return company && lowerCitation.includes(company);
  });

  return relevantCitations.length > 0 ? relevantCitations : citations.slice(0, 2);
}

function filterAndRankResults(jobs: AIJobResult[], request: AISearchRequest): AIJobResult[] {
  let filteredJobs = jobs;

  // Filter by confidence threshold
  filteredJobs = filteredJobs.filter(job => job.ai_confidence >= 0.3);

  // Filter by salary range if specified
  if (request.salary_range) {
    filteredJobs = filteredJobs.filter(job => {
      if (!job.salary_estimate) return true; // Include jobs without salary info
      
      const jobMin = job.salary_estimate.min || 0;
      const jobMax = job.salary_estimate.max || Number.MAX_SAFE_INTEGER;
      
      // Check if job salary range overlaps with requested range
      return !(jobMax < request.salary_range!.min || jobMin > request.salary_range!.max);
    });
  }

  // Filter by employment type
  if (request.employment_type) {
    filteredJobs = filteredJobs.filter(job => 
      job.employment_type === request.employment_type ||
      job.employment_type === 'full_time' // Default fallback
    );
  }

  // Rank by relevance score
  filteredJobs = filteredJobs
    .map(job => ({
      ...job,
      relevance_score: calculateRelevanceScore(job, request)
    }))
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map(job => {
      // Remove the temporary relevance_score field
      const { relevance_score, ...jobWithoutScore } = job;
      return jobWithoutScore as AIJobResult;
    });

  // Limit to max_results
  const maxResults = request.max_results || 10;
  return filteredJobs.slice(0, maxResults);
}

function calculateRelevanceScore(job: AIJobResult, request: AISearchRequest): number {
  let score = job.ai_confidence * 50; // Base score from AI confidence

  // Boost score for skill matches
  if (request.skills && request.skills.length > 0) {
    const jobText = `${job.title} ${job.description}`.toLowerCase();
    const skillMatches = request.skills.filter(skill => 
      jobText.includes(skill.toLowerCase())
    ).length;
    
    score += (skillMatches / request.skills.length) * 30;
  }

  // Boost score for location match
  if (request.location) {
    const jobLocation = job.location.toLowerCase();
    const requestedLocation = request.location.toLowerCase();
    
    if (jobLocation.includes(requestedLocation) || 
        (requestedLocation === 'remote' && jobLocation.includes('remote'))) {
      score += 15;
    }
  }

  // Boost score for career level match  
  if (request.career_level) {
    const jobTitle = job.title.toLowerCase();
    if (jobTitle.includes(request.career_level)) {
      score += 10;
    }
  }

  // Boost score for recent posts
  if (job.posted_date) {
    const postedDate = new Date(job.posted_date);
    const daysSincePosted = (Date.now() - postedDate.getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysSincePosted <= 7) score += 10;
    else if (daysSincePosted <= 30) score += 5;
  }

  // Boost score for direct employer posts
  if (job.source_platform === 'LinkedIn' || job.source_platform === 'Company Career Page') {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

function calculateSearchConfidence(jobs: AIJobResult[]): number {
  if (jobs.length === 0) return 0;

  const avgConfidence = jobs.reduce((sum, job) => sum + job.ai_confidence, 0) / jobs.length;
  
  // Adjust confidence based on number of results found
  let confidenceMultiplier = 1;
  if (jobs.length >= 8) confidenceMultiplier = 1.1;
  else if (jobs.length >= 5) confidenceMultiplier = 1.05;
  else if (jobs.length < 3) confidenceMultiplier = 0.8;

  return Math.min(1, avgConfidence * confidenceMultiplier);
}
