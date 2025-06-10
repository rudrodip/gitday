#!/usr/bin/env bun
// gitday
// log daily progress

import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_FILE = join(homedir(), '.gitday-config.json');

interface Config {
  apiKey?: string;
  author?: string;
}

interface CommitInfo {
  hash: string;
  subject: string;
  body: string;
  timestamp: string;
  time: string;
  author: string;
  type: 'feature' | 'fix' | 'refactor' | 'docs' | 'other';
  emoji: string;
  prNumber?: string;
  fileStats?: string;
}

interface CommitStats {
  count: number;
  files: number;
  insertions: number;
  deletions: number;
  firstCommit?: string;
  lastCommit?: string;
  developmentTime?: string;
}

function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.warn('⚠️  Could not load config file, creating new one');
  }
  return {};
}

function saveConfig(config: Config): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('❌ Failed to save config:', error);
  }
}

function promptForApiKey(): string {
  console.log('\n🔑 API Key Setup');
  console.log('Get your API key from: https://aistudio.google.com/apikey');
  console.log('Please enter your Gemini API key:');
  
  try {
    const apiKey = execSync('read -s key && echo $key', { 
      encoding: 'utf8', 
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: '/bin/bash'
    }).trim();
    
    if (!apiKey) {
      console.error('❌ No API key entered');
      process.exit(1);
    }
    
    return apiKey;
  } catch (error) {
    console.error('❌ Failed to read API key');
    process.exit(1);
  }
}

function checkApiKey(): string {
  let apiKey = process.env.GEMINI_API_KEY;
  
  if (apiKey) {
    return apiKey;
  }
  
  const config = loadConfig();
  apiKey = config.apiKey;
  
  if (apiKey) {
    return apiKey;
  }
  
  console.log('❌ GEMINI_API_KEY not found in environment or config file');
  apiKey = promptForApiKey();
  
  config.apiKey = apiKey;
  saveConfig(config);
  console.log('✅ API key saved to config file');
  
  return apiKey;
}

async function generateSummary(prompt: string): Promise<string> {
  const apiKey = checkApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    console.log('🤖 Generating summary with AI...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: prompt,
    });
    return response.text || '';
  } catch (error) {
    console.error('❌ Failed to generate AI summary:', error);
    throw error;
  }
}

const IGNORE_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'deno.lock'
];

interface CliOptions {
  output?: string;
  log?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): { command: string; options: CliOptions } {
  const command = args[2] || 'help';
  const options: CliOptions = {};
  
  for (let i = 3; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-l' || arg === '--log') {
      options.log = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }
  
  return { command, options };
}

function showHelp(): void {
  console.log(`
gitday v2.0.0
Generate comprehensive daily progress logs from git commits and diffs

Usage:
  gitday <command> [options]

Commands:
  today      Generate detailed log for today's commits with stats
  unpushed   Generate detailed log for unpushed commits with stats  
  both       Generate log for both today's and unpushed commits
  config     Manage API key and author configuration
  help       Show this help message

Options:
  -o, --output <file>   Output file (default: prompt.txt)
  -l, --log             Log to console instead of file
  -h, --help            Show help message

Config Commands:
  config show           Show current API key and author status
  config set            Update API key
  config delete         Remove saved API key

Features:
  📊 Commit statistics (count, lines changed, files modified)
  ⏰ Development time tracking (first to last commit)
  🚀 Commit categorization with emojis (feat, fix, refactor, docs)
  🌿 Branch activity overview
  🔗 PR number extraction
  👤 Author-specific filtering

Examples:
  gitday today
  gitday unpushed -o summary.txt
  gitday both --log
  gitday config show
`);
}

async function checkGitRepo(): Promise<boolean> {
  try {
    execSync('git status', { stdio: 'ignore' });
    return true;
  } catch {
    console.error('❌ Not in a git repository. This tool only works in git repositories.');
    process.exit(1);
  }
}

function getCommitType(subject: string): { type: CommitInfo['type']; emoji: string } {
  if (subject.match(/^feat/)) return { type: 'feature', emoji: '✨' };
  if (subject.match(/^fix/)) return { type: 'fix', emoji: '🐛' };
  if (subject.match(/^refactor/)) return { type: 'refactor', emoji: '♻️' };
  if (subject.match(/^docs/)) return { type: 'docs', emoji: '📚' };
  return { type: 'other', emoji: '🔧' };
}

function extractPrNumber(subject: string): string | undefined {
  const match = subject.match(/#(\d+)/);
  return match ? `#${match[1]}` : undefined;
}

function getGitAuthor(): string {
  try {
    const config = loadConfig();
    if (config.author) {
      return config.author;
    }
    
    const author = execSync('git config user.name', { encoding: 'utf8' }).trim();
    config.author = author;
    saveConfig(config);
    return author;
  } catch {
    return 'Unknown';
  }
}

async function getDetailedCommits(since: string, until?: string, author?: string): Promise<CommitInfo[]> {
  try {
    const authorFilter = author ? `--author="${author}"` : '';
    const timeFilter = until ? 
      `--since="${since}" --until="${until}"` : 
      `--since="${since}"`;
    
    const output = execSync(
      `git log ${authorFilter} ${timeFilter} --all --reverse --pretty=format:"%H|%s|%b|%ai|%an"`,
      { encoding: 'utf8' }
    );
    
    if (!output.trim()) return [];
    
    const commits: CommitInfo[] = [];
    const commitLines = output.trim().split('\n');
    
    for (const line of commitLines) {
      const [hash, subject, body, timestamp, commitAuthor] = line.split('|');
      if (!hash) continue;
      
      const time = timestamp.split(' ')[1].substring(0, 5); // HH:MM
      const { type, emoji } = getCommitType(subject);
      const prNumber = extractPrNumber(subject);
      
      // Get file stats for this commit
      let fileStats: string | undefined;
      try {
        const stats = execSync(`git show --stat --format="" ${hash}`, { encoding: 'utf8' });
        const lastLine = stats.trim().split('\n').pop();
        if (lastLine && lastLine.match(/\d+ files? changed/)) {
          fileStats = lastLine.replace(/[(),]/g, '');
        }
      } catch {
        // Ignore stats errors
      }
      
      commits.push({
        hash,
        subject,
        body: body || '',
        timestamp,
        time,
        author: commitAuthor,
        type,
        emoji,
        prNumber,
        fileStats
      });
    }
    
    return commits;
  } catch {
    return [];
  }
}

async function getCommitStats(since: string, until?: string, author?: string): Promise<CommitStats> {
  try {
    const authorFilter = author ? `--author="${author}"` : '';
    const timeFilter = until ? 
      `--since="${since}" --until="${until}"` : 
      `--since="${since}"`;
    
    // Get commit count
    const countOutput = execSync(
      `git log ${authorFilter} ${timeFilter} --all --oneline | wc -l`,
      { encoding: 'utf8' }
    );
    const count = parseInt(countOutput.trim());
    
    if (count === 0) {
      return { count: 0, files: 0, insertions: 0, deletions: 0 };
    }
    
    // Get file statistics
    const statsOutput = execSync(
      `git log ${authorFilter} ${timeFilter} --all --shortstat`,
      { encoding: 'utf8' }
    );
    
    let files = 0, insertions = 0, deletions = 0;
    const statLines = statsOutput.split('\n');
    for (const line of statLines) {
      const fileMatch = line.match(/(\d+) files? changed/);
      const insMatch = line.match(/(\d+) insertions?/);
      const delMatch = line.match(/(\d+) deletions?/);
      
      if (fileMatch) files += parseInt(fileMatch[1]);
      if (insMatch) insertions += parseInt(insMatch[1]);
      if (delMatch) deletions += parseInt(delMatch[1]);
    }
    
    // Get first and last commit times for development window
    const timestampsOutput = execSync(
      `git log ${authorFilter} ${timeFilter} --all --pretty=format:"%ai"`,
      { encoding: 'utf8' }
    );
    
    const timestamps = timestampsOutput.trim().split('\n');
    const firstCommit = timestamps[timestamps.length - 1];
    const lastCommit = timestamps[0];
    
    let developmentTime: string | undefined;
    if (firstCommit && lastCommit && timestamps.length > 1) {
      const firstTime = firstCommit.split(' ')[1];
      const lastTime = lastCommit.split(' ')[1];
      
      const firstSeconds = timeToSeconds(firstTime);
      const lastSeconds = timeToSeconds(lastTime);
      
      if (lastSeconds > firstSeconds) {
        const diffSeconds = lastSeconds - firstSeconds;
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        developmentTime = `${hours}h ${minutes}m`;
      }
    }
    
    return {
      count,
      files,
      insertions,
      deletions,
      firstCommit: firstCommit?.split(' ')[1]?.substring(0, 5),
      lastCommit: lastCommit?.split(' ')[1]?.substring(0, 5),
      developmentTime
    };
  } catch {
    return { count: 0, files: 0, insertions: 0, deletions: 0 };
  }
}

function timeToSeconds(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 3600 + minutes * 60;
}

async function getBranchActivity(since: string, author?: string): Promise<{ current: string; activeBranches: string[] }> {
  try {
    const current = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    const branchesOutput = execSync("git for-each-ref --format='%(refname:short)' refs/heads/", { encoding: 'utf8' });
    const branches = branchesOutput.trim().split('\n');
    
    const activeBranches: string[] = [];
    const authorFilter = author ? `--author="${author}"` : '';
    
    for (const branch of branches) {
      try {
        const commitCount = execSync(
          `git log ${authorFilter} --since="${since}" ${branch} --oneline | wc -l`,
          { encoding: 'utf8' }
        );
        if (parseInt(commitCount.trim()) > 0) {
          activeBranches.push(branch);
        }
      } catch {
        // Ignore branch errors
      }
    }
    
    return { current, activeBranches };
  } catch {
    return { current: 'unknown', activeBranches: [] };
  }
}

async function getTodayCommits(): Promise<string[]> {
  try {
    const author = getGitAuthor();
    const output = execSync(`git log --author="${author}" --since="midnight" --pretty=format:"%h - %s (%an)"`, 
      { encoding: 'utf8' });
    return output.trim() ? output.trim().split('\n') : [];
  } catch {
    return [];
  }
}

async function getUnpushedCommits(): Promise<string[]> {
  try {
    const author = getGitAuthor();
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (!currentBranch) return [];
    
    const output = execSync(`git log --author="${author}" origin/${currentBranch}..HEAD --pretty=format:"%h - %s (%an)"`, 
      { encoding: 'utf8' });
    return output.trim() ? output.trim().split('\n') : [];
  } catch {
    return [];
  }
}

async function getDiffFromMain(): Promise<string> {
  try {
    const diff = execSync('git diff main', { encoding: 'utf8' });
    
    const lines = diff.split('\n');
    const filteredLines: string[] = [];
    let skipFile = false;
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const fileName = line.split(' ').pop()?.replace('b/', '');
        skipFile = IGNORE_FILES.some(ignoreFile => fileName?.includes(ignoreFile));
      }
      
      if (!skipFile) {
        filteredLines.push(line);
      }
    }
    
    return filteredLines.join('\n');
  } catch (error) {
    console.warn('⚠️  Could not get diff from main branch, using working directory diff instead');
    try {
      return execSync('git diff', { encoding: 'utf8' });
    } catch {
      return 'No changes found';
    }
  }
}

function generateEnhancedPrompt(commits: CommitInfo[], stats: CommitStats, branchInfo: { current: string; activeBranches: string[] }, diff: string, type: 'today' | 'unpushed'): string {
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const author = getGitAuthor();
  const commitType = type === 'today' ? 'today' : 'unpushed';
  
  let prompt = `# 📊 Daily Development Summary - ${date}

**Author:** ${author}
**Total Commits:** ${stats.count} commits
**Lines Changed:** ~${stats.insertions + stats.deletions}+ lines across ${stats.files}+ files

## 🚀 Commits & Changes (${commitType})
`;

  if (commits.length === 0) {
    prompt += 'No commits found\n\n';
  } else {
    for (const commit of commits) {
      const typeLabel = commit.type.charAt(0).toUpperCase() + commit.type.slice(1);
      prompt += `**${commit.time}** ${commit.emoji} **${typeLabel}** ${commit.prNumber || ''}
- ${commit.subject}
`;
      if (commit.body.trim()) {
        prompt += `  ${commit.body.replace(/\n/g, '\n  ')}\n`;
      }
      if (commit.fileStats) {
        prompt += `  *Files: ${commit.fileStats}*\n`;
      }
      prompt += '\n';
    }
  }

  if (stats.developmentTime && stats.firstCommit && stats.lastCommit) {
    prompt += `## ⏰ Development Time
**First Commit:** ${stats.firstCommit}
**Last Commit:** ${stats.lastCommit}
**Total Development Window:** ${stats.developmentTime}

`;
  }

  prompt += `## 🌿 Branch Activity
**Current Branch:** \`${branchInfo.current}\`
**Branches with commits ${commitType}:**
${branchInfo.activeBranches.map(branch => `- \`${branch}\``).join('\n')}

## Code Changes
\`\`\`diff
${diff || 'No changes found'}
\`\`\`

## Instructions
Based on the above commits and changes, provide a concise summary with these sections (only include sections that apply):

**Features:**
- [new features added]

**Refactors:**
- [code improvements/restructuring]

**Issues Resolved:**
- [bugs fixed/issues closed]

**Other:**
- [anything else noteworthy]

One line per item. Skip sections if nothing applies.`;

  return prompt;
}

async function handleOutput(prompt: string, options: CliOptions): Promise<void> {
  const aiSummary = await generateSummary(prompt);

  if (options.log) {
    console.log(aiSummary);
  } else {
    const outputFile = options.output || 'prompt.txt';
    writeFileSync(outputFile, aiSummary);
    console.log(`✅ Prompt and AI summary written to ${outputFile}`);
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  
  if (options.help || command === 'help') {
    showHelp();
    return;
  }
  
  await checkGitRepo();
  const author = getGitAuthor();
  
  switch (command) {
    case 'today': {
      const commits = await getDetailedCommits('midnight', undefined, author);
      const stats = await getCommitStats('midnight', undefined, author);
      const branchInfo = await getBranchActivity('midnight', author);
      const diff = await getDiffFromMain();
      const prompt = generateEnhancedPrompt(commits, stats, branchInfo, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'unpushed': {
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      if (!currentBranch) {
        console.error('❌ No current branch found');
        return;
      }
      
      // Get commit hashes for unpushed commits first
      const unpushedHashes = execSync(`git log --author="${author}" origin/${currentBranch}..HEAD --pretty=format:"%H"`, 
        { encoding: 'utf8' }).trim().split('\n').filter(h => h);
      
      if (unpushedHashes.length === 0) {
        console.log('No unpushed commits found');
        return;
      }
      
      // Get detailed info for these specific commits
      const commits: CommitInfo[] = [];
      for (const hash of unpushedHashes) {
        try {
          const output = execSync(`git show --pretty=format:"%H|%s|%b|%ai|%an" --no-patch ${hash}`, { encoding: 'utf8' });
          const [, subject, body, timestamp, commitAuthor] = output.split('|');
          
          const time = timestamp.split(' ')[1].substring(0, 5);
          const { type, emoji } = getCommitType(subject);
          const prNumber = extractPrNumber(subject);
          
          let fileStats: string | undefined;
          try {
            const stats = execSync(`git show --stat --format="" ${hash}`, { encoding: 'utf8' });
            const lastLine = stats.trim().split('\n').pop();
            if (lastLine && lastLine.match(/\d+ files? changed/)) {
              fileStats = lastLine.replace(/[(),]/g, '');
            }
          } catch {}
          
          commits.push({
            hash,
            subject,
            body: body || '',
            timestamp,
            time,
            author: commitAuthor,
            type,
            emoji,
            prNumber,
            fileStats
          });
        } catch {}
      }
      
      const stats = await getCommitStats('midnight', undefined, author); // Approximate stats
      stats.count = commits.length;
      const branchInfo = await getBranchActivity('midnight', author);
      const diff = await getDiffFromMain();
      const prompt = generateEnhancedPrompt(commits, stats, branchInfo, diff, 'unpushed');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'both': {
      const todayCommits = await getDetailedCommits('midnight', undefined, author);
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      
      let unpushedCommits: CommitInfo[] = [];
      if (currentBranch) {
        const unpushedHashes = execSync(`git log --author="${author}" origin/${currentBranch}..HEAD --pretty=format:"%H"`, 
          { encoding: 'utf8' }).trim().split('\n').filter(h => h);
        
        for (const hash of unpushedHashes) {
          try {
            const output = execSync(`git show --pretty=format:"%H|%s|%b|%ai|%an" --no-patch ${hash}`, { encoding: 'utf8' });
            const [, subject, body, timestamp, commitAuthor] = output.split('|');
            
            const time = timestamp.split(' ')[1].substring(0, 5);
            const { type, emoji } = getCommitType(subject);
            const prNumber = extractPrNumber(subject);
            
            unpushedCommits.push({
              hash,
              subject,
              body: body || '',
              timestamp,
              time,
              author: commitAuthor,
              type,
              emoji,
              prNumber
            });
          } catch {}
        }
      }
      
      // Combine and deduplicate commits
      const allCommitsMap = new Map<string, CommitInfo>();
      todayCommits.forEach(c => allCommitsMap.set(c.hash, c));
      unpushedCommits.forEach(c => allCommitsMap.set(c.hash, c));
      const allCommits = Array.from(allCommitsMap.values());
      
      const stats = await getCommitStats('midnight', undefined, author);
      const branchInfo = await getBranchActivity('midnight', author);
      const diff = await getDiffFromMain();
      const prompt = generateEnhancedPrompt(allCommits, stats, branchInfo, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'config': {
      const subcommand = process.argv[3] || 'show';
      
      switch (subcommand) {
        case 'show': {
          const config = loadConfig();
          console.log('Current configuration:');
          console.log(config.apiKey ? '✅ API key found' : '❌ No API key saved');
          console.log(`👤 Author: ${config.author || 'Not set (will use git config)'}`);
          break;
        }
        
        case 'set': {
          const newApiKey = promptForApiKey();
          const config = loadConfig();
          config.apiKey = newApiKey;
          saveConfig(config);
          console.log('✅ API key updated');
          break;
        }
        
        case 'delete': {
          const config = loadConfig();
          config.apiKey = undefined;
          saveConfig(config);
          console.log('✅ API key removed');
          break;
        }
        
        default:
          console.error(`❌ Unknown config command: ${subcommand}`);
          console.log('Run "gitday config help" for usage information.');
          process.exit(1);
      }
      break;
    }
    
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "gitday help" for usage information.');
      process.exit(1);
  }
}

main().catch(console.error);
