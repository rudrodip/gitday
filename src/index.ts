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
gitday v1.0.0
Generate daily progress logs from git commits and diffs

Usage:
  gitday <command> [options]

Commands:
  today      Generate log for today's commits
  unpushed   Generate log for unpushed commits  
  both       Generate log for both today's and unpushed commits
  config     Manage API key configuration
  help       Show this help message

Options:
  -o, --output <file>   Output file (default: prompt.txt)
  -l, --log             Log to console instead of file
  -h, --help            Show help message

Config Commands:
  config show           Show current API key status
  config set            Update API key
  config delete         Remove saved API key

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

async function getTodayCommits(): Promise<string[]> {
  try {
    const output = execSync(`git log --since="midnight" --pretty=format:"%h - %s (%an)"`, 
      { encoding: 'utf8' });
    return output.trim() ? output.trim().split('\n') : [];
  } catch {
    return [];
  }
}

async function getUnpushedCommits(): Promise<string[]> {
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (!currentBranch) return [];
    
    const output = execSync(`git log origin/${currentBranch}..HEAD --pretty=format:"%h - %s (%an)"`, 
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

function generatePrompt(commits: string[], diff: string, type: 'today' | 'unpushed'): string {
  const commitType = type === 'today' ? 'today' : 'unpushed';
  
  return `# Daily Progress Summary

## Commits (${commitType})
${commits.length > 0 ? commits.map(commit => `- ${commit}`).join('\n') : 'No commits found'}

## Code Changes
\`\`\`diff
${diff || 'No changes found'}
\`\`\`

## Instructions
List only what applies:

**Features:**
- [new features added]

**Refactors:**
- [code improvements/restructuring]

**Issues Resolved:**
- [bugs fixed/issues closed]

**Other:**
- [anything else noteworthy]

One line per item. Skip sections if nothing applies.`;
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
  
  switch (command) {
    case 'today': {
      const commits = await getTodayCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'unpushed': {
      const commits = await getUnpushedCommits();
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(commits, diff, 'unpushed');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'both': {
      const todayCommits = await getTodayCommits();
      const unpushedCommits = await getUnpushedCommits();
      const allCommits = [...new Set([...todayCommits, ...unpushedCommits])];
      const diff = await getDiffFromMain();
      const prompt = generatePrompt(allCommits, diff, 'today');
      await handleOutput(prompt, options);
      break;
    }
    
    case 'config': {
      const subcommand = process.argv[3] || 'show';
      
      switch (subcommand) {
        case 'show': {
          const config = loadConfig();
          console.log('Current API key status:');
          console.log(config.apiKey ? '✅ API key found' : '❌ No API key saved');
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
