export function showPrompt(message: string, defaultValue?: string) {
  return prompt(message, defaultValue)
}

export function showConfirm(message: string) {
  return confirm(message)
}

export function showAlert(message: string) {
  alert(message)
}
