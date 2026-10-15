<script setup lang="ts">
// The changelog lives in the project root (updatelog.md) and is bundled at build time.
import source from '../../../updatelog.md?raw';
import { parseMarkdown } from '../markdown';

const blocks = parseMarkdown(source);
function headingParts(text: string) {
  const match = text.match(/^((?:beta\s*|v)?\d+(?:\.\d+)+)(.*)$/i);
  return match ? { version: match[1], rest: match[2] } : null;
}
</script>

<template>
  <main class="update-log" data-update-log>
    <template v-for="(block, index) in blocks" :key="index">
      <component :is="`h${block.level + 1}`" v-if="block.kind === 'heading'" :class="`update-log-h${block.level}`">
        <template v-for="(segment, i) in block.segments" :key="i"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else-if="block.level === 2 && headingParts(segment.text)"><span class="update-log-version">{{ headingParts(segment.text)!.version }}</span>{{ headingParts(segment.text)!.rest }}</template><template v-else>{{ segment.text }}</template></template>
      </component>
      <hr v-else-if="block.kind === 'rule'">
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(item, i) in block.items" :key="i">
          <template v-for="(segment, j) in item.segments" :key="j"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template>
          <ul v-if="item.children.length">
            <li v-for="(child, j) in item.children" :key="j">
              <template v-for="(segment, k) in child" :key="k"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template>
            </li>
          </ul>
        </li>
      </ul>
      <p v-else :class="{ 'subtle small': block.kind === 'quote' }">
        <template v-for="(segment, i) in block.segments" :key="i"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template>
      </p>
    </template>
    <p v-if="!blocks.length" class="empty">暂无更新日志。</p>
  </main>
</template>
