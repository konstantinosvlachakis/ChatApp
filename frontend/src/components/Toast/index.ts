import { toast, toastApiError } from "./toastStore";

export { default as ToastViewport } from "./ToastViewport";
export { toast, toastApiError, showToast, dismissToast } from "./toastStore";

/** Hook form for components: `const { error, success, apiError } = useToast();` */
export const useToast = () => ({ ...toast, apiError: toastApiError });
