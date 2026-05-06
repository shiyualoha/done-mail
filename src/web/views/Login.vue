<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage, loginWithAdminKey } from '../api/client';

const router = useRouter();
const adminKey = ref('');
const loading = ref(false);

async function login() {
  const value = adminKey.value.trim();
  if (!value) {
    ElMessage.error('请输入管理员 Key');
    return;
  }

  loading.value = true;
  try {
    await loginWithAdminKey(value);
    router.push('/inbox');
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '管理员 Key 不正确'));
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
    <section class="login-panel" aria-label="管理员登录">
      <h1>登录控制台</h1>
      <el-form class="login-form" label-position="top" @submit.prevent="login">
        <el-form-item label="管理员 Key">
          <el-input v-model="adminKey" type="password" show-password autofocus autocomplete="current-password" @keyup.enter="login" />
        </el-form-item>
        <button type="button" class="login-submit" :disabled="loading" @click="login">
          <span v-if="loading" class="mc-button-spinner"></span>
          {{ loading ? '验证中' : '登录' }}
        </button>
      </el-form>
    </section>
  </main>
</template>
