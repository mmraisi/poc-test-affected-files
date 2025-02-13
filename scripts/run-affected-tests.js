import fs from 'node:fs'
import path from 'node:path'
import { glob } from 'glob'
import { spawn } from 'node:child_process'
import { Octokit } from '@octokit/rest'

// Initialize Octokit (you'll need a GitHub token)
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function getChangedFiles() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error('Cannot find GITHUB_EVENT_PATH to determine changed files.');
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));


  const { repository, pull_request } = event;

  console.log("pull_request", pull_request?.files || 'nothing');


  // For 'synchronize' events, use the files array directly
  if (event.action === 'synchronize') {
    return pull_request.files.map((file) => file.filename).filter((file) => file.endsWith('.js')) || [];
  }

  // For other PR events, fetch the changed files via the GitHub API
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pull_request.number,
  });


  return files.map((file) => file.filename).filter((file) => file.endsWith('.js')) || [];
}


// Map source files to test files
function mapToTestFiles(changedFiles) {
  const testFiles = []
  console.log(changedFiles);
  changedFiles.forEach((file) => {
    const testFile = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      file.replace(/^server\//, 'server/test/unit/').replace(/\.js$/, '.js')
    )
    if (glob.sync(testFile).length > 0) {
      testFiles.push(testFile)
    }
  })
  return testFiles
}

// Main function
async function runTests() {
  const changedFiles = getChangedFiles()
  if (changedFiles.length === 0) {
    console.log('No affected files detected.')
    return
  }

  const testFiles = mapToTestFiles(changedFiles)
  if (testFiles.length === 0) {
    console.log('No relevant test files detected.')
    return
  }

  console.log('Running affected tests for:', testFiles.join(', '))
  const testRunner = spawn(
    'node',
    ['--test', ...testFiles],
    {
      stdio: 'inherit'
    }
  )

  testRunner.on('error', (error) => {
    console.log(`error: ${error.message}`)
  })

  testRunner.on('close', (code) => {
    if (code !== 0) {
      process.exit(code)
    }
  })
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
