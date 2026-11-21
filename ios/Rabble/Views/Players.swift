import AVFoundation
import Combine
import Foundation

/// Pre-show music: plays the mood's tracks locally while active. Each phone
/// runs its own player; nothing goes into the room or the recording.
@MainActor
final class MusicPlayer: ObservableObject {
    @Published var index = 0
    @Published var error: String?

    private let player = AVPlayer()
    private var currentURL: URL?
    private var endObserver: NSObjectProtocol?

    init() {
        player.volume = 0.35
    }

    deinit {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }

    /// Play `url` (or pause when nil). Advancing to the next track is the caller's job via `onEnd`.
    func sync(url: URL?, playing: Bool, onEnd: @escaping () -> Void) {
        guard playing, let url else {
            player.pause()
            return
        }
        if url != currentURL {
            currentURL = url
            let item = AVPlayerItem(url: url)
            if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
            endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { _ in
                Task { @MainActor in onEnd() }
            }
            player.replaceCurrentItem(with: item)
        }
        player.play()
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        currentURL = nil
    }
}

/// Plays a finished show's recording. The audio URL redirects to a
/// short-lived signed object URL; AVPlayer follows it and streams with
/// range requests, so seeking works.
@MainActor
final class ReplayPlayer: ObservableObject {
    @Published var playing = false
    @Published var loading = false
    @Published var position: Double = 0
    @Published var duration: Double
    @Published var error: String?

    private let url: URL
    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusWatch: AnyCancellable?

    init(url: URL, durationSeconds: Int?) {
        self.url = url
        duration = Double(durationSeconds ?? 0)
    }

    deinit {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }

    func toggle() {
        error = nil
        guard let player else {
            start()
            return
        }
        if playing {
            player.pause()
            playing = false
        } else {
            player.play()
            playing = true
        }
    }

    func seek(to fraction: Double) {
        guard let player, duration > 0 else { return }
        position = fraction * duration
        player.seek(to: CMTime(seconds: position, preferredTimescale: 600))
    }

    private func start() {
        if loading { return }
        loading = true
        // Replays play outside a LiveKit room, so the session is ours to set.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        statusWatch = item.publisher(for: \.status).receive(on: DispatchQueue.main).sink { [weak self] status in
            guard let self else { return }
            switch status {
            case .readyToPlay:
                self.loading = false
                let d = item.duration.seconds
                if d.isFinite, d > 0 { self.duration = d }
                player.play()
                self.playing = true
            case .failed:
                self.loading = false
                self.error = item.error?.localizedDescription ?? "Could not play the recording."
            default:
                break
            }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            Task { @MainActor in self?.position = time.seconds }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in
                self?.playing = false
                self?.position = self?.duration ?? 0
            }
        }
    }
}
