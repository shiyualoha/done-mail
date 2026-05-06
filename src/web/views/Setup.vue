<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage, setupAdminKey } from '../api/client';

const router = useRouter();
const adminKey = ref('');
const confirmKey = ref('');
const loading = ref(false);

async function setup() {
  const value = adminKey.value.trim();
  const confirmValue = confirmKey.value.trim();
  if (!value) {
    ElMessage.error('请填写管理员 Key');
    return;
  }
  if (value !== confirmValue) {
    ElMessage.error('两次输入的管理员 Key 不一致');
    return;
  }

  loading.value = true;
  try {
    await setupAdminKey(value);
    ElMessage.success('管理员 Key 已创建');
    await router.replace('/inbox');
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '初始化失败'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-shell">
    <div class="login-brand">
      <img src="/static/logo-mark.svg" alt="DoneMail" />
      <span>DoneMail</span>
    </div>
    <section class="login-panel" aria-label="系统初始化">
      <h1>初始化控制台</h1>
      <el-form class="login-form" label-position="top" @submit.prevent="setup">
        <el-form-item label="管理员 Key">
          <el-input v-model="adminKey" type="password" show-password autofocus autocomplete="new-password" @keyup.enter="setup" />
        </el-form-item>
        <el-form-item label="确认管理员 Key">
          <el-input v-model="confirmKey" type="password" show-password autocomplete="new-password" @keyup.enter="setup" />
        </el-form-item>
        <button type="button" class="login-submit" :disabled="loading" @click="setup">
          <span v-if="loading" class="mc-button-spinner"></span>
          {{ loading ? '创建中' : '创建并进入' }}
        </button>
      </el-form>
    </section>
  </main>
</template>
