<script setup lang="ts">
import { computed, ref } from 'vue';
import { STORY_CHAPTERS } from '../../data/story';
import type { GameState, StoryChapterId } from '../../types/state';
const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ read: [id: StoryChapterId] }>();
const opened = ref<StoryChapterId | null>(null);
const phases = [{ id: 1, name: '第一阶段 · 地面文明' }, { id: 2, name: '第二阶段 · 太阳系文明' }, { id: 3, name: '第三阶段 · 空间的另一种走法' }];
const chapters = computed(() => {
  props.revision;
  return STORY_CHAPTERS.map((chapter, index) => ({ ...chapter, number: STORY_CHAPTERS.slice(0, index + 1).filter(row => !row.appendix).length,
    unlocked: props.state.story.unlocked.includes(chapter.id), unread: !props.state.story.read.includes(chapter.id) }));
});
function open(id: StoryChapterId) {
  if (opened.value === id) { opened.value = null; return; }
  opened.value = id;
  emit('read', id);
}
</script>

<template>
  <section class="story-archive" aria-labelledby="storyTitle">
    <h2 id="storyTitle">文明档案</h2>
    <p class="subtle">记录猫猫们走过的道路。达成里程碑后自动收录，无需阅读或等待剧情即可继续发展。</p>
    <p class="small subtle">档案跨软重置、核爆与逃离保留，硬重置清空。旧存档按可确认的进度补录，不记录推测的发生时间。</p>
    <section v-for="phase in phases" :key="phase.id" class="story-phase" :data-story-phase="phase.id">
      <h3>{{ phase.name }}</h3>
      <article v-for="chapter in chapters.filter(row => row.phase === phase.id && !row.appendix)" :key="chapter.id" class="story-chapter" :data-story-chapter="chapter.id">
        <button v-if="chapter.unlocked" class="story-heading" :data-story-open="chapter.id" :aria-expanded="opened === chapter.id" @click="open(chapter.id)">
          <span>第{{ chapter.number }}章 · {{ chapter.title }}</span>
          <span v-if="chapter.unread" class="story-unread" aria-label="未读">未读</span>
          <span v-else class="subtle">已读</span>
        </button>
        <p v-else class="story-locked">第{{ chapter.number }}章 · 尚未收录</p>
        <div v-if="chapter.unlocked && opened === chapter.id" class="story-text" :data-story-text="chapter.id">
          <p v-for="(paragraph, index) in chapter.text.split('\n')" :key="index">{{ paragraph }}</p>
        </div>
      </article>
      <h4 v-if="phase.id !== 3">文明侧记 · 独立附录</h4>
      <p v-if="phase.id !== 3" class="small subtle">以下记录独立收录，无需完成本阶段主线或其他附录。</p>
      <article v-for="chapter in chapters.filter(row => row.phase === phase.id && row.appendix)" :key="chapter.id" class="story-chapter" :data-story-appendix="chapter.id">
        <button v-if="chapter.unlocked" class="story-heading" :data-story-open="chapter.id" :aria-expanded="opened === chapter.id" @click="open(chapter.id)">
          <span>附录 · {{ chapter.title }}</span>
          <span v-if="chapter.unread" class="story-unread" aria-label="未读">未读</span>
          <span v-else class="subtle">已读</span>
        </button>
        <p v-else class="story-locked">独立附录 · 尚未收录</p>
        <div v-if="chapter.unlocked && opened === chapter.id" class="story-text" :data-story-text="chapter.id">
          <p v-for="(paragraph, index) in chapter.text.split('\n')" :key="index">{{ paragraph }}</p>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.story-archive { max-width: 880px; margin: 0 auto; }
.story-phase { margin-top: 26px; }
.story-chapter { margin: 10px 0; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.story-heading { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px; border: 0; border-radius: 0; text-align: left; }
.story-unread { color: #e6c777; font-size: 12px; flex-shrink: 0; }
.story-locked { padding: 14px; margin: 0; color: var(--muted); }
.story-text { padding: 0 20px 12px; line-height: 1.95; }
.story-text p { margin: 14px 0; }
</style>
