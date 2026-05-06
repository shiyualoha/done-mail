import type { App } from 'vue';
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs';
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import { ElInput } from 'element-plus/es/components/input/index.mjs';
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs';
import { ElLoading } from 'element-plus/es/components/loading/index.mjs';
import { ElSwitch } from 'element-plus/es/components/switch/index.mjs';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs';
import { provideGlobalConfig } from 'element-plus/es/components/config-provider/index.mjs';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/el-button.css';
import 'element-plus/theme-chalk/el-checkbox.css';
import 'element-plus/theme-chalk/el-dialog.css';
import 'element-plus/theme-chalk/el-form.css';
import 'element-plus/theme-chalk/el-form-item.css';
import 'element-plus/theme-chalk/el-icon.css';
import 'element-plus/theme-chalk/el-input.css';
import 'element-plus/theme-chalk/el-input-number.css';
import 'element-plus/theme-chalk/el-loading.css';
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-overlay.css';
import 'element-plus/theme-chalk/el-popper.css';
import 'element-plus/theme-chalk/el-switch.css';
import 'element-plus/theme-chalk/el-table.css';
import 'element-plus/theme-chalk/el-table-column.css';

const components = [
  ElCheckbox,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSwitch,
  ElTable,
  ElTableColumn
];

export function registerElementPlus(app: App) {
  provideGlobalConfig({ locale: zhCn }, app, true);
  for (const component of components) {
    app.use(component);
  }
  app.use(ElLoading);
}
