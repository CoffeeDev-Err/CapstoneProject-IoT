// Browser mode is only for local UI preview. Keep its token scoped to this tab
// instead of pretending that browser storage has SecureStore guarantees.
export const getStoredAuthToken = async (key: string) => window.sessionStorage.getItem(key);
export const setStoredAuthToken = async (key: string, token: string) => {
  window.sessionStorage.setItem(key, token);
};
export const deleteStoredAuthToken = async (key: string) => {
  window.sessionStorage.removeItem(key);
};
