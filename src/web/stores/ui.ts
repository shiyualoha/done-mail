import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    inboxDetailId: '',
    inboxDetailOpen: false,
    sentDetailId: '',
    sentDetailOpen: false,
    selectedRootDomainId: ''
  }),
  actions: {
    openInboxDetail(id: string) {
      this.inboxDetailId = id;
      this.inboxDetailOpen = true;
    },
    closeInboxDetail() {
      this.inboxDetailId = '';
      this.inboxDetailOpen = false;
    },
    openSentDetail(id: string) {
      this.sentDetailId = id;
      this.sentDetailOpen = true;
    },
    closeSentDetail() {
      this.sentDetailId = '';
      this.sentDetailOpen = false;
    },
    selectRootDomain(id: string) {
      this.selectedRootDomainId = id;
    },
    clearRootDomain() {
      this.selectedRootDomainId = '';
    }
  }
});
