import { registerRootComponent } from 'expo'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ErrorBoundary } from './src/components/ErrorBoundary'
import App from './App'

function Root() {
  return React.createElement(
    SafeAreaProvider,
    null,
    React.createElement(ErrorBoundary, null, React.createElement(App)),
  )
}

registerRootComponent(Root)
