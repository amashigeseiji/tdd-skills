import SwiftUI

/// @vocab: アプリウィンドウ
struct AppWindow: View {
    var body: some View {
        ErrorView()
    }
}

/// @vocab: エラー表示
struct ErrorView: View {
    var body: some View {
        Text("error")
    }
}
