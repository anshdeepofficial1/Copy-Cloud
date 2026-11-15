import { defineConfig } from 'vite'
import path from 'path'
import { readFileSync, writeFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Emit actual HTML entry points for direct visits and refreshes on Vercel.
function copyCloudPageEntries() {
  return {
    name: 'copycloud-page-entries',
    apply: 'build' as const,
    closeBundle() {
      const out = path.resolve(__dirname, 'dist')
      const shell = readFileSync(path.join(out, 'index.html'), 'utf8')
      const routes = ['workspace','send','receive','retrieve','history','about','features','how-it-works','getting-started','faq','status','admin-approval']
      for (const route of routes) {
        const page = shell.replace(/(<link rel="canonical" href="https:\/\/copycloud\.me)\/(\s*"\s*\/?>)/, '$1/' + route + '$2')
        writeFileSync(path.join(out, route + '.html'), page)
      }
      const manifest = JSON.parse(readFileSync(path.join(out,'.vite','manifest.json'),'utf8'))
      const assets = new Set<string>()
      const seen = new Set<string>()
      function visit(key:string){
        if(seen.has(key)||!manifest[key])return
        seen.add(key)
        const value=manifest[key]
        if(value.file)assets.add('/'+value.file)
        for(const css of value.css||[])assets.add('/'+css)
        for(const dep of value.imports||[])visit(dep)
      }
      for(const key of Object.keys(manifest))if(key==='index.html'||/src\/app\/editorial\/(EditorialApp|HomeStory|TransferStudio)\.tsx$/.test(key))visit(key)
      writeFileSync(path.join(out,'offline-assets.json'),JSON.stringify([...assets]))
      console.log('[CopyCloud] Emitted ' + routes.length + ' direct page entries')
    },
  }
}

export default defineConfig({
  plugins: [figmaAssetResolver(), react(), tailwindcss(), copyCloudPageEntries()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 8080,
    strictPort: true,
  },
  build: { manifest: true },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
