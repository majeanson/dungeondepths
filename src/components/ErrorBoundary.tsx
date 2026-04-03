import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { COLORS } from '../theme'

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View style={styles.container}>
        <Text style={styles.glyph}>☠</Text>
        <Text style={styles.title}>SOMETHING BROKE</Text>
        <Text style={styles.detail} numberOfLines={4}>
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={styles.btnText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  glyph: {
    fontSize: 48,
    color: COLORS.red,
  },
  title: {
    color: COLORS.red,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
  },
  detail: {
    color: COLORS.textDim,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 6,
  },
  btnText: {
    color: COLORS.gold,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
})
